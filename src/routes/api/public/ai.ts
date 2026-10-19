import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ prompt: z.string().min(1).max(30000) });

// Provider selection (first match wins):
//   1. LOVABLE_API_KEY  -> Lovable AI gateway (injected automatically on Lovable hosting)
//   2. AI_API_KEY       -> any OpenAI-compatible chat-completions API, for hosting outside Lovable.
//        AI_BASE_URL  (default https://generativelanguage.googleapis.com/v1beta/openai  i.e. Google Gemini)
//        AI_MODEL     (default gemini-2.5-flash)
//      Other examples:
//        OpenAI     AI_BASE_URL=https://api.openai.com/v1                 AI_MODEL=gpt-4o-mini
//        Anthropic  AI_BASE_URL=https://api.anthropic.com/v1              AI_MODEL=claude-haiku-5-5
function provider() {
  const lovable = process.env["LOVABLE_API_KEY"];
  if (lovable) {
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: lovable,
      model: "google/gemini-2.5-flash",
    };
  }
  const key = process.env["AI_API_KEY"];
  if (key) {
    const base = (
      process.env["AI_BASE_URL"] ||
      "https://generativelanguage.googleapis.com/v1beta/openai"
    ).replace(/\/+$/, "");
    return {
      url: `${base}/chat/completions`,
      key,
      model: process.env["AI_MODEL"] || "gemini-2.5-flash",
    };
  }
  return null;
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
              hint: "Set LOVABLE_API_KEY (Lovable hosting) or AI_API_KEY (any other host) as a server environment variable.",
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
          const err = await response.text();
          console.error(`AI provider failed [${response.status}]: ${err}`);
          return Response.json(
            {
              error: `AI request failed [${response.status}]`,
              code: response.status === 401 || response.status === 403 ? "bad_key" : "provider_error",
            },
            { status: 502 },
          );
        }

        const data = await response.json();
        const text: string = data?.choices?.[0]?.message?.content ?? "";
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
