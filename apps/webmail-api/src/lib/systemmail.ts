import nodemailer from "nodemailer";
import { env } from "../config/env.js";

/**
 * Send a system email (e.g. a login OTP) without a user's credentials.
 * Relays through the internal Postfix on port 25, which trusts the Docker network
 * (permit_mynetworks) — no SASL auth needed. From = ALERT_FROM (set this to a real
 * address on your domain for deliverability).
 */
export async function sendSystemMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: env.MAIL_TLS_REJECT_UNAUTHORIZED },
  });
  await transport.sendMail({ from: env.ALERT_FROM, to, subject, text, html });
}
