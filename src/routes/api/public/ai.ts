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

// Retry policy: at most ONE retry, only for transient failures, only when the wait is short.
const MAX_ATTEMPTS = 2;
const MAX_RETRY_WAIT_MS = 3000;
const DEFAULT_RETRY_WAIT_MS = 1000;

function env(name: string): string | undefined {
  let v = process.env[name]?.trim();
  // A key pasted into Vercel with surrounding quotes would otherwise be sent verbatim and rejected.
  if (v && v.length > 1 && /^(["']).*\1$/.test(v)) v = v.slice(1, -1).trim();
  return v || undefined;
}

type Provider = {
  url: string;
  key: string;
  model: string;
  name: "lovable" | "openai" | "gemini" | "custom";
  keySource: string;
};

function provider(): Provider | null {
  const lovable = env("LOVABLE_API_KEY");
  if (lovable) {
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: lovable,
      model: "google/gemini-2.5-flash",
      name: "lovable",
      keySource: "LOVABLE_API_KEY",
    };
  }
  const openaiKey = env("OPENAI_API_KEY");
  const genericKey = env("AI_API_KEY");
  const key = openaiKey || genericKey;
  if (!key) return null;
  const isOpenAI = !!openaiKey || key.startsWith("sk-");
  const base = (env("AI_BASE_URL") || (isOpenAI ? OPENAI_BASE : GEMINI_BASE)).replace(/\/+$/, "");
  const name = base.includes("api.openai.com")
    ? "openai"
    : base.includes("generativelanguage.googleapis.com")
      ? "gemini"
      : "custom";
  return {
    url: `${base}/chat/completions`,
    key,
    model:
      env("AI_MODEL") || env("OPENAI_MODEL") || (isOpenAI ? "gpt-4o-mini" : "gemini-2.5-flash"),
    name,
    keySource: openaiKey ? "OPENAI_API_KEY" : "AI_API_KEY",
  };
}

function redact(text: string, key: string): string {
  return text
    .split(key)
    .join("[redacted]")
    .replace(/sk-[A-Za-z0-9_*-]{6,}/g, "sk-[redacted]");
}

// ---------------------------------------------------------------------------
// Provider error analysis. Only machine-readable fields are ever sent to the
// browser. The provider's free-text message stays server-side (a 401 message can
// echo a partially masked key) and is used only to classify the failure.
// ---------------------------------------------------------------------------
type ProviderError = {
  type?: string | undefined;
  code?: string | undefined;
  status?: string | undefined;
  message: string;
  json: boolean;
};

function asText(v: unknown): string | undefined {
  if (typeof v === "string" && v) return v.slice(0, 80);
  if (typeof v === "number") return String(v);
  return undefined;
}

function parseProviderError(raw: string): ProviderError {
  try {
    const j = JSON.parse(raw);
    // OpenAI: {error:{...}}   Gemini: [{error:{...}}]
    const e = (Array.isArray(j) ? j[0] : j)?.error ?? (Array.isArray(j) ? j[0] : j);
    return {
      type: asText(e?.type),
      code: typeof e?.code === "string" ? asText(e.code) : undefined, // numeric code == HTTP status, not informative
      status: asText(e?.status),
      message: typeof e?.message === "string" ? e.message : "",
      json: true,
    };
  } catch {
    return { message: raw.slice(0, 300), json: false };
  }
}

const QUOTA_CODES = new Set([
  "insufficient_quota",
  "billing_not_active",
  "billing_hard_limit_reached",
  "billing_limit_reached",
]);
// Deliberately specific: Gemini's per-minute error says "check quota", which must NOT match.
const QUOTA_MESSAGE =
  /insufficient[_ ]quota|exceeded your current quota|billing (details|hard limit|not active)|credit balance|out of credits?|check your plan/i;
const TOO_LARGE_MESSAGE =
  /request too large|too large for|maximum context length|reduce the length/i;

function secondsFromHeaders(h: Headers, message: string): number | undefined {
  const ra = Number(h.get("retry-after"));
  if (Number.isFinite(ra) && ra > 0) return Math.ceil(ra);
  const ms = Number(h.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms / 1000);
  const m = /try again in ([\d.]+)\s*(ms|s|m)\b/i.exec(message);
  if (m?.[1] && m[2]) {
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    return Math.ceil(unit === "ms" ? n / 1000 : unit === "m" ? n * 60 : n);
  }
  return undefined;
}

function num(h: Headers, name: string): number | undefined {
  const n = Number(h.get(name));
  return h.get(name) !== null && Number.isFinite(n) ? n : undefined;
}

type Failure = {
  code: string;
  status: number;
  providerCode?: string | undefined;
  limitKind?: string | undefined;
  retryAfter?: number | undefined;
  limits?: Record<string, number> | undefined;
  retryable: boolean;
};

function classify(status: number, pe: ProviderError, headers: Headers): Failure {
  const providerCode = pe.code ?? pe.type ?? pe.status;
  const retryAfter = secondsFromHeaders(headers, pe.message);
  const base = { status, providerCode, retryAfter };
  const sig = [pe.code, pe.type, pe.status].map((x) => x?.toLowerCase());

  if (status === 401) return { ...base, code: "bad_key", retryable: false };
  if (status === 403) {
    const region = pe.code === "unsupported_country_region_territory";
    return { ...base, code: region ? "region_blocked" : "bad_key", retryable: false };
  }
  if (status === 429) {
    const isQuota =
      sig.some((x) => x && QUOTA_CODES.has(x)) || (pe.json && QUOTA_MESSAGE.test(pe.message));
    if (isQuota) return { ...base, code: "quota", retryable: false };
    if (TOO_LARGE_MESSAGE.test(pe.message)) {
      return { ...base, code: "too_large", limitKind: "tokens", retryable: false };
    }
    const limits: Record<string, number> = {};
    for (const [k, h] of [
      ["limitRequests", "x-ratelimit-limit-requests"],
      ["remainingRequests", "x-ratelimit-remaining-requests"],
      ["limitTokens", "x-ratelimit-limit-tokens"],
      ["remainingTokens", "x-ratelimit-remaining-tokens"],
    ] as const) {
      const n = num(headers, h);
      if (n !== undefined) limits[k] = n;
    }
    return {
      ...base,
      code: "rate_limited",
      limitKind: pe.type === "requests" || pe.type === "tokens" ? pe.type : undefined,
      limits: Object.keys(limits).length ? limits : undefined,
      // Retry once only if the provider says the wait is short (or gives no hint).
      retryable: retryAfter === undefined || retryAfter * 1000 <= MAX_RETRY_WAIT_MS,
    };
  }
  if (status === 404 || pe.code === "model_not_found") {
    return { ...base, code: "bad_model", retryable: false };
  }
  if (status === 400) return { ...base, code: "bad_request", retryable: false };
  if (status >= 500) return { ...base, code: "provider_unavailable", retryable: true };
  return { ...base, code: "provider_error", retryable: false };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function failureResponse(p: Provider, f: Failure, retried: boolean): Response {
  const { retryable: _retryable, ...pub } = f;
  return Response.json(
    {
      error: `AI request failed [${f.status}]`,
      ...pub,
      provider: p.name,
      model: p.model,
      keySource: p.keySource,
      retried,
    },
    { status: 502 },
  );
}

// Calls the provider with a bounded retry (max 1 retry, <=3s wait, transient failures only).
async function callProvider(
  p: Provider,
  prompt: string,
): Promise<{ response: Response } | { fail: Response }> {
  for (let attempt = 1; ; attempt++) {
    const last = attempt >= MAX_ATTEMPTS;
    let response: Response;
    try {
      response = await fetch(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: p.model,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant. Always respond with raw JSON only — no markdown fences, no commentary.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
    } catch (e) {
      console.error(`AI provider unreachable (attempt ${attempt}) url=${p.url}:`, e);
      if (!last) {
        await sleep(DEFAULT_RETRY_WAIT_MS);
        continue;
      }
      return {
        fail: Response.json(
          {
            error: "AI provider unreachable",
            code: "unreachable",
            provider: p.name,
            model: p.model,
            retried: attempt > 1,
          },
          { status: 502 },
        ),
      };
    }
    if (response.ok) return { response };

    const raw = await response.text();
    const pe = parseProviderError(raw);
    const f = classify(response.status, pe, response.headers);
    console.error(
      `AI provider failed [${f.status}] attempt=${attempt} class=${f.code} provider=${p.name} model=${p.model} key=${p.keySource} ` +
        `type=${pe.type ?? "-"} code=${pe.code ?? "-"} status=${pe.status ?? "-"} retryAfter=${f.retryAfter ?? "-"} ` +
        `limits=${JSON.stringify(f.limits ?? {})} json=${pe.json}: ${redact(pe.message || raw, p.key).slice(0, 300)}`,
    );
    if (!last && f.retryable) {
      await sleep(Math.min((f.retryAfter ?? 0) * 1000 || DEFAULT_RETRY_WAIT_MS, MAX_RETRY_WAIT_MS));
      continue;
    }
    return { fail: failureResponse(p, f, attempt > 1) };
  }
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

        const result = await callProvider(p, parsed.data.prompt);
        if ("fail" in result) return result.fail;
        const response = result.response;

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
        // Non-secret metadata so the Test button can show what actually answered.
        const headers = {
          "x-ai-provider": p.name,
          "x-ai-model": p.model,
          "x-ai-key-source": p.keySource,
        };
        try {
          return Response.json(extractJSON(text), { headers });
        } catch {
          // Model returned non-JSON; wrap it so the client still gets valid JSON
          return Response.json({ text: text.trim() }, { headers });
        }
      },
    },
  },
});
