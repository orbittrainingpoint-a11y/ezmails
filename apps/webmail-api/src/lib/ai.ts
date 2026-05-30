import { env } from "../config/env.js";
import { AppError } from "./errors.js";

/**
 * AI Smart Write — Google Gemini (free tier) via the Generative Language API.
 * Model configurable via GEMINI_MODEL. Gracefully unavailable without a key.
 */
export function aiEnabled(): boolean {
  return !!env.GEMINI_API_KEY;
}

interface GenerateOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export async function aiGenerate(opts: GenerateOptions): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new AppError(503, "AI_DISABLED", "AI Smart Write is not configured. Set GEMINI_API_KEY.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: { maxOutputTokens: opts.maxTokens ?? 1024, temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AppError(502, "AI_UPSTREAM", `AI request failed (${res.status}).`, detail.slice(0, 500));
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}
