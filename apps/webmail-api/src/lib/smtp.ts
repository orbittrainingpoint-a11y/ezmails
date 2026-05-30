import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface OutgoingAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/** Send mail through Postfix submission, authenticating as the mailbox user. */
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
): Promise<{ messageId: string }> {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: creds.email, pass: creds.password },
    tls: { rejectUnauthorized: env.MAIL_TLS_REJECT_UNAUTHORIZED },
  });

  const info = await transport.sendMail({
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments,
  });
  return { messageId: info.messageId };
}
