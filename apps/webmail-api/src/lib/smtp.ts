import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface OutgoingAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface Message {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: OutgoingAttachment[];
}

/** Build the full MIME (with attachments + a plain-text alternative) without sending. */
export async function buildRawMessage(message: Message): Promise<{ raw: Buffer; messageId: string }> {
  // HTML-only mail scores worse with spam filters — derive a text/plain part.
  const text =
    message.text ??
    (message.html
      ? message.html
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<br\s*\/?>(?=)/gi, "\n")
          .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/gi, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      : undefined);

  const builder = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const built = await builder.sendMail({
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    html: message.html,
    text,
    attachments: message.attachments,
  });
  return { raw: built.message as Buffer, messageId: built.messageId };
}

/**
 * Send mail through Postfix submission. Builds the MIME once, sends that exact raw,
 * and returns it so the caller can append an identical copy to the Sent folder.
 */
export async function sendMail(creds: { email: string; password: string }, message: Message): Promise<{ messageId: string; raw: Buffer }> {
  const { raw, messageId } = await buildRawMessage(message);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: creds.email, pass: creds.password },
    tls: { rejectUnauthorized: env.MAIL_TLS_REJECT_UNAUTHORIZED },
  });
  // Envelope delivers to all recipients (incl. bcc); the raw has no Bcc header.
  const to = [...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])];
  await transport.sendMail({ envelope: { from: message.from, to }, raw });
  return { messageId, raw };
}
