import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ prompt: z.string().min(1).max(30000) });

// Provider selection (first match wins):
//   1. LOVABLE_API_KEY  -> Lovable AI gateway (injected automatically on Lovable hosting)
//   2. OPENAI_API_KEY   -> OpenAI (recommended on Vercel / any other host)
//   3. AI_API_KEY       -> legacy alias, any OpenAI-compatible chat-completions API
//
// Optional overrides (apply to 2 and 3):
//   AI_BASE_URL  chat-completions base URL
//   AI_MODEL     model id (OPENAI_MODEL is accepted as an alias)
//
// Defaults are chosen from the key so a key is never sent to the wrong vendor:
//   OPENAI_API_KEY, or an AI_API_KEY starting with "sk-"  -> https://api.openai.com/v1 , gpt-4o-mini
//   any other AI_API_KEY (e.g. Google "AIza...")           -> Gemini OpenAI-compat URL, gemini-2.5-flash
const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function provider() {
  const lovable = env("LOVABLE_API_KEY");
  if (lovable) {
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: lovable,
      model: "google/gemini-2.5-flash",
    };
  }
  const openaiKey = env("OPENAI_API_KEY");
  const genericKey = env("AI_API_KEY");
  const key = openaiKey || genericKey;
  if (!key) return null;
  const isOpenAI = !!openaiKey || key.startsWith("sk-");
  const base = (env("AI_BASE_URL") || (isOpenAI ? OPENAI_BASE : GEMINI_BASE)).replace(/\/+$/, "");
  return {
    url: `${base}/chat/completions`,
    key,
    model:
      env("AI_MODEL") || env("OPENAI_MODEL") || (isOpenAI ? "gpt-4o-mini" : "gemini-2.5-flash"),
  };
}

// Pull only the machine-readable error code/type out of a provider error body.
// Never forward the provider's free-text message to the browser: for 401s it can
// contain a partially masked copy of the API key.
async function providerErrorCode(
  response: Response,
): Promise<{ raw: string; code?: string | undefined }> {
  const raw = await response.text();
  try {
    const j = JSON.parse(raw);
    const e = Array.isArray(j) ? j[0]?.error : j?.error;
    const c = e?.code ?? e?.type ?? e?.status;
    return { raw, code: typeof c === "string" ? c.slice(0, 60) : undefined };
  } catch {
    return { raw };
  }
}

function redact(text: string, key: string): string {
  return text
    .split(key)
    .join("[redacted]")
    .replace(/sk-[A-Za-z0-9_*-]{6,}/g, "sk-[redacted]");
}

// Models often wrap JSON in ``` fences or add a sentence before/after it.
function extractJSON(text: string): unknown {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to block extraction */
  }
  const open = cleaned.search(/[{[]/);
  if (open === -1) throw new Error("no JSON found");
  const closer = cleaned[open] === "{" ? "}" : "]";
  const close = cleaned.lastIndexOf(closer);
  if (close <= open) throw new Error("unterminated JSON");
  return JSON.parse(cleaned.slice(open, close + 1));
}

export const Route = createFileRoute("/api/public/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const p = provider();
        if (!p) {
          return Response.json(
            {
              error: "AI is not configured",
              code: "no_key",
              hint: "Set OPENAI_API_KEY (or AI_API_KEY) as a server environment variable and redeploy.",
            },
            { status: 500 },
          );
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }

        let response: Response;
        try {
          response = await fetch(p.url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${p.key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: p.model,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a helpful assistant. Always respond with raw JSON only — no markdown fences, no commentary.",
                },
                { role: "user", content: parsed.data.prompt },
              ],
            }),
          });
        } catch (e) {
          console.error("AI provider unreachable:", e);
          return Response.json(
            { error: "AI provider unreachable", code: "unreachable" },
            { status: 502 },
          );
        }

        if (!response.ok) {
          const { raw, code: providerCode } = await providerErrorCode(response);
          console.error(
            `AI provider failed [${response.status}] model=${p.model} url=${p.url} code=${providerCode ?? "n/a"}: ${redact(raw, p.key).slice(0, 500)}`,
          );
          const s = response.status;
          let code = "provider_error";
          if (s === 401 || s === 403) code = "bad_key";
          else if (s === 429 && providerCode === "insufficient_quota") code = "quota";
          else if (s === 429) code = "rate_limited";
          else if (s === 404 || providerCode === "model_not_found") code = "bad_model";
          return Response.json(
            {
              error: `AI request failed [${s}]`,
              code,
              status: s,
              ...(providerCode ? { providerCode } : {}),
              model: p.model,
            },
            { status: 502 },
          );
        }

        let data: { choices?: { message?: { content?: unknown } }[] };
        try {
          data = await response.json();
        } catch (e) {
          console.error("AI provider returned a non-JSON success body:", e);
          return Response.json(
            { error: "AI provider returned an unreadable response", code: "bad_response" },
            { status: 502 },
          );
        }
        const content = data?.choices?.[0]?.message?.content;
        const text = typeof content === "string" ? content : "";
        if (!text.trim()) {
          console.error("AI provider returned empty content:", JSON.stringify(data).slice(0, 300));
          return Response.json(
            { error: "The AI returned an empty answer", code: "empty" },
            { status: 502 },
          );
        }
        try {
          return Response.json(extractJSON(text));
        } catch {
          // Model returned non-JSON; wrap it so the client still gets valid JSON
          return Response.json({ text: text.trim() });
        }
      },
    },
  },
});
