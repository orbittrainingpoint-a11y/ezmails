import { aiGenerate } from "../lib/ai.js";

/** Generate a fresh email draft from a short instruction (AI Smart Write). */
export async function draftEmail(input: { instruction: string; tone?: string }): Promise<{ subject: string; body: string }> {
  const text = await aiGenerate({
    system:
      "You are an expert email writing assistant. Write clear, professional emails. " +
      "Return the result as a subject line on the first line prefixed with 'Subject: ', " +
      "then a blank line, then the email body in simple HTML (use <p>, <ul>, <strong>). " +
      "Do not include markdown fences or commentary.",
    prompt: `Tone: ${input.tone ?? "professional"}.\nWrite an email about: ${input.instruction}`,
    maxTokens: 1200,
  });

  const match = /^Subject:\s*(.+?)\n([\s\S]*)$/i.exec(text);
  if (match) return { subject: match[1]!.trim(), body: match[2]!.trim() };
  return { subject: "", body: text };
}

/** Generate a quick reply given the message being replied to. */
export async function quickReply(input: { original: string; instruction?: string; tone?: string }): Promise<{ body: string }> {
  const body = await aiGenerate({
    system:
      "You are an email reply assistant. Write a concise, polite reply in simple HTML (<p> tags). " +
      "Do not restate the entire original message. Do not include a subject line, markdown, or commentary.",
    prompt:
      `Tone: ${input.tone ?? "professional"}.\n` +
      (input.instruction ? `Reply intent: ${input.instruction}\n` : "") +
      `\nOriginal message:\n${input.original.slice(0, 6000)}`,
    maxTokens: 800,
  });
  return { body };
}

/** Fix grammar/spelling of a draft without changing its meaning or tone. */
export async function fixGrammar(input: { text: string; html?: boolean }): Promise<{ text: string }> {
  const text = await aiGenerate({
    system:
      "You are a proofreader. Correct spelling, grammar, and punctuation in the user's text. " +
      "Preserve the original meaning, tone, language, and formatting. Do NOT add, remove, or rephrase content beyond fixing errors. " +
      (input.html
        ? "The input is HTML — return corrected HTML only, keeping the same tags. "
        : "Return plain corrected text only. ") +
      "No commentary, no markdown fences.",
    prompt: input.text.slice(0, 8000),
    maxTokens: 1500,
  });
  return { text: text.trim() };
}

/** Summarize a message into a few bullet points (AI Summary). */
export async function summarizeEmail(input: { text: string }): Promise<{ summary: string }> {
  const summary = await aiGenerate({
    system:
      "You summarize emails. Return 2-4 short bullet points capturing the key points and any " +
      "requested actions. Plain text bullets starting with '- '. No preamble, no HTML, no markdown headers.",
    prompt: `Summarize this email:\n\n${input.text.slice(0, 8000)}`,
    maxTokens: 400,
  });
  return { summary };
}
