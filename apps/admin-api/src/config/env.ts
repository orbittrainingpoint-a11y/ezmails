import { z } from "zod";
import { fileURLToPath } from "node:url";

// Dev convenience: load the monorepo-root .env if present (Node 20.6+ / 24).
try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    fileURLToPath(new URL("../../../../.env", import.meta.url)),
  );
} catch {
  /* no root .env (e.g. in Docker where env is injected) — ignore */
}

// Validate the environment once at boot. Fail fast with a clear message.
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  ADMIN_API_PORT: z.coerce.number().default(3001),
  ADMIN_PANEL_URL: z.string().url().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().min(1),

  // 512-bit (128 hex chars) secret for signing access JWTs.
  JWT_SECRET: z.string().min(32),
  JWT_SECRET_PREVIOUS: z.string().optional(),
  JWT_ACCESS_TTL: z.string().default("15m"),
  SESSION_TTL_HOURS: z.coerce.number().default(24),

  // 32-byte (64 hex chars) key for AES-256-GCM at-rest encryption.
  TOTP_ENCRYPTION_KEY: z.string().length(64, "TOTP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),

  BCRYPT_COST: z.coerce.number().min(10).max(15).default(12),

  // SMTP for outbound system mail (password reset, alerts) → Postfix.
  SMTP_HOST: z.string().default("postfix"),
  SMTP_PORT: z.coerce.number().default(587),
  ALERT_FROM: z.string().default("no-reply@localhost"),

  // Mail server identity — used to generate MX/SPF/DKIM/DMARC records.
  MAIL_HOSTNAME: z.string().default("mail.localhost"),
  DKIM_KEY_PATH: z.string().default("/var/lib/rspamd/dkim"),
  DKIM_SELECTOR: z.string().default("ezmails"),

  // Shared secret for node agents / log shippers posting to internal endpoints.
  INTERNAL_TOKEN: z.string().optional(),
  // Set to "false" to skip starting BullMQ workers (e.g. in tests).
  ENABLE_WORKERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Mail-node agent port (Phase 12 agent exposes queue/stats over HTTP).
  NODE_AGENT_PORT: z.coerce.number().default(9101),
  LOG_RETENTION_DAYS: z.coerce.number().default(90),

  // Default Rspamd spam thresholds (overridable per-domain / via settings UI).
  RSPAMD_TAG_SCORE: z.coerce.number().default(6),
  RSPAMD_GREYLIST_SCORE: z.coerce.number().default(9),
  RSPAMD_REJECT_SCORE: z.coerce.number().default(15),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
