import nodemailer from "nodemailer";
import { env } from "../config/env.js";

// Outbound system mail (password reset, alerts) relayed through the local Postfix.
// No auth needed: the API container is a trusted client on the internal network.
const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  tls: { rejectUnauthorized: false }, // internal self-signed during bootstrap
});

export async function sendSystemMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  await transport.sendMail({
    from: env.ALERT_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
