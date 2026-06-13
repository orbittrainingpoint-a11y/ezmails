import { prisma, type Prisma } from "@ezmails/db";
import { sha256 } from "../lib/crypto.js";
import { sendSystemMail } from "../lib/systemmail.js";
import { getRecoveryEmail } from "./mfa.service.js";

export type SecurityEventType =
  | "login" | "login_new_device"
  | "2fa_enabled" | "2fa_disabled"
  | "password_changed" | "recovery_email_changed"
  | "app_password_created" | "app_password_revoked"
  | "session_revoked";

export interface SecurityEvent { ts: string; type: SecurityEventType; ip?: string; ua?: string; detail?: string }

const MAX_LOG = 40;

async function readPrefs(mailboxId: string): Promise<Record<string, unknown>> {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  return (s?.prefs as Record<string, unknown> | null) ?? {};
}
async function writePrefs(mailboxId: string, patch: Record<string, unknown>): Promise<void> {
  const prefs = await readPrefs(mailboxId);
  const next = { ...prefs, ...patch } as unknown as Prisma.InputJsonValue;
  await prisma.webmailSettings.upsert({ where: { mailboxId }, create: { mailboxId, prefs: next }, update: { prefs: next } });
}

/** Append a security event to the per-mailbox activity log (capped, newest first). */
export async function recordEvent(mailboxId: string, type: SecurityEventType, meta: { ip?: string; ua?: string; detail?: string } = {}): Promise<void> {
  const prefs = await readPrefs(mailboxId);
  const log = (Array.isArray(prefs.securityLog) ? (prefs.securityLog as SecurityEvent[]) : []);
  const next: SecurityEvent[] = [{ ts: new Date().toISOString(), type, ip: meta.ip, ua: meta.ua?.slice(0, 200), detail: meta.detail }, ...log].slice(0, MAX_LOG);
  await writePrefs(mailboxId, { securityLog: next });
}

export async function listEvents(mailboxId: string): Promise<SecurityEvent[]> {
  return ((await readPrefs(mailboxId)).securityLog as SecurityEvent[] | undefined) ?? [];
}

/**
 * Record a login. If it's from a device/IP we haven't seen, log it as new and
 * email an alert to the recovery address (or the mailbox itself). Best-effort.
 */
export async function onLogin(mailboxId: string, email: string, ip?: string, ua?: string): Promise<void> {
  const prefs = await readPrefs(mailboxId);
  const fp = sha256(`${ip ?? ""}|${(ua ?? "").slice(0, 120)}`);
  const known = Array.isArray(prefs.knownDevices) ? (prefs.knownDevices as string[]) : [];
  const isNew = !known.includes(fp);

  await recordEvent(mailboxId, isNew ? "login_new_device" : "login", { ip, ua });

  if (isNew) {
    await writePrefs(mailboxId, { knownDevices: [fp, ...known].slice(0, 50) });
    const to = (await getRecoveryEmail(mailboxId)) || email;
    sendSystemMail(
      to,
      "New sign-in to your Infinit Email account",
      `A new device just signed in to ${email}.\n\nIP: ${ip ?? "unknown"}\nDevice: ${ua ?? "unknown"}\nTime: ${new Date().toUTCString()}\n\nIf this wasn't you, change your password now and sign out other sessions in Settings → Security.`,
    ).catch(() => {});
  }
}
