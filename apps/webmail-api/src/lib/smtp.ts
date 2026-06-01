import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface OutgoingAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/**
 * Send mail through Postfix submission. Builds the full MIME (with attachments)
 * ONCE via nodemailer's stream transport, sends that exact raw, and returns it so
 * the caller can append an identical copy to the Sent folder.
 */
export async function sendMail(
  creds: { email: string; password: string },
  message: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    html?: string;
    text?: string;
    attachments?: OutgoingAttachment[];
  },
): Promise<{ messageId: string; raw: Buffer }> {
  // Always include a plain-text alternative (HTML-only mail scores worse with spam filters).
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

  const mailOptions = {
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    html: message.html,
    text,
    attachments: message.attachments,
  };

  // Build the raw message (with attachments) without sending.
  const builder = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const built = await builder.sendMail(mailOptions);
  const raw = built.message as Buffer;

  // Send the exact raw over the authenticated submission transport.
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: creds.email, pass: creds.password },
    tls: { rejectUnauthorized: env.MAIL_TLS_REJECT_UNAUTHORIZED },
  });
  await transport.sendMail({ envelope: built.envelope, raw });

  return { messageId: built.messageId, raw };
}
