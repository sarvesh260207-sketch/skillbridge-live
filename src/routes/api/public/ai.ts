import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ prompt: z.string().min(1).max(30000) });

export const Route = createFileRoute("/api/public/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "AI is not configured" }, { status: 500 });
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

        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a helpful assistant. Always respond with raw JSON only — no markdown fences, no commentary.",
                },
                { role: "user", content: parsed.data.prompt },
              ],
            }),
          },
        );

        if (!response.ok) {
          const err = await response.text();
          console.error(`AI gateway failed [${response.status}]: ${err}`);
          return Response.json(
            { error: `AI request failed [${response.status}]` },
            { status: 502 },
          );
        }

        const data = await response.json();
        const text: string =
          data?.choices?.[0]?.message?.content ?? "";
        const cleaned = text
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        try {
          return Response.json(JSON.parse(cleaned));
        } catch {
          // Model returned non-JSON; wrap it so the client still gets valid JSON
          return Response.json({ text: cleaned });
        }
      },
    },
  },
});
