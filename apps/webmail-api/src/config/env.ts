import { z } from "zod";
import { fileURLToPath } from "node:url";

// Dev convenience: load the monorepo-root .env if present (Node 20.6+ / 24).
try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    fileURLToPath(new URL("../../../../.env", import.meta.url)),
  );
} catch {
  /* no root .env — ignore */
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  WEBMAIL_API_PORT: z.coerce.number().default(3002),
  WEBMAIL_URL: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  // Reused to encrypt the IMAP password stored in the server-side session.
  TOTP_ENCRYPTION_KEY: z.string().length(64),

  IMAP_HOST: z.string().default("dovecot"),
  IMAP_PORT: z.coerce.number().default(993),
  SMTP_HOST: z.string().default("postfix"),
  SMTP_PORT: z.coerce.number().default(587),

  // Allow self-signed certs on the internal network during bootstrap.
  MAIL_TLS_REJECT_UNAUTHORIZED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  WEBMAIL_SESSION_TTL_HOURS: z.coerce.number().default(12),
  ATTACHMENT_LIMIT_BYTES: z.coerce.number().default(26214400),

  // AI Smart Write (Google Gemini — free tier). Disabled gracefully if unset.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  // Public base URL for campaign open-tracking pixels + booking links.
  PUBLIC_BASE_URL: z.string().default("http://localhost:5173"),
  ALERT_FROM: z.string().default("no-reply@localhost"),

  // DEV ONLY: verify mailbox passwords against the DB hash instead of a live
  // IMAP server, so webmail can be demoed without Dovecot. Never enable in prod.
  WEBMAIL_DEV_BYPASS_IMAP: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid webmail-api env:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
