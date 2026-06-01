import { env } from "../config/env.js";
import { AppError } from "./errors.js";

/**
 * AI Smart Write. Two backends:
 *  - AI_PROVIDER=gemini  → Google Generative Language API (GEMINI_API_KEY).
 *  - AI_PROVIDER=openai  → any OpenAI-compatible chat API (AI_API_KEY/AI_BASE_URL/AI_MODEL),
 *    e.g. the free Groq tier. Gracefully unavailable when no key is set.
 */
export function aiEnabled(): boolean {
  return env.AI_PROVIDER === "openai" ? !!env.AI_API_KEY : !!env.GEMINI_API_KEY;
}

interface GenerateOptions {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export async function aiGenerate(opts: GenerateOptions): Promise<string> {
  return env.AI_PROVIDER === "openai" ? openaiGenerate(opts) : geminiGenerate(opts);
}

// ── OpenAI-compatible (Groq, OpenRouter, Together, OpenAI, …) ──
async function openaiGenerate(opts: GenerateOptions): Promise<string> {
  if (!env.AI_API_KEY) {
    throw new AppError(503, "AI_DISABLED", "AI is not configured. Set AI_API_KEY (e.g. a free Groq key).");
  }
  const res = await fetch(`${env.AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.AI_API_KEY}` },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      max_tokens: opts.maxTokens ?? 1024,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const code = res.status === 429 ? "AI_RATE_LIMITED" : "AI_UPSTREAM";
    const msg = res.status === 429 ? "AI is busy (rate limit) — try again in a moment." : `AI request failed (${res.status}).`;
    throw new AppError(res.status === 429 ? 429 : 502, code, msg, detail.slice(0, 500));
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

// ── Google Gemini ──
async function geminiGenerate(opts: GenerateOptions): Promise<string> {
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
    const code = res.status === 429 ? "AI_RATE_LIMITED" : "AI_UPSTREAM";
    const msg = res.status === 429 ? "AI quota/rate limit hit — try again later or switch provider." : `AI request failed (${res.status}).`;
    throw new AppError(res.status === 429 ? 429 : 502, code, msg, detail.slice(0, 500));
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}
