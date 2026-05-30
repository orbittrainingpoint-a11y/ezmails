// Scheduled send. Stored in WebmailSettings.prefs.scheduled (JSON) so no schema
// migration is needed. Because background workers are disabled in local dev, due
// messages are flushed opportunistically whenever the mailbox lists folders or
// its scheduled queue — this makes "send later" actually deliver in the demo.
import { prisma, type Prisma } from "@ezmails/db";
import { randomToken } from "../lib/crypto.js";
import type { WebmailCreds } from "../lib/session.js";
import { send as sendMail } from "./mail.service.js";

export interface ScheduledMail {
  id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: { filename: string; contentBase64: string; contentType?: string }[];
  scheduledAt: string; // ISO
  createdAt: string; // ISO
}

const j = (v: unknown) => v as unknown as Prisma.InputJsonValue;

async function read(mailboxId: string): Promise<ScheduledMail[]> {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  return (((s?.prefs as { scheduled?: ScheduledMail[] } | null)?.scheduled) ?? []);
}

async function write(mailboxId: string, scheduled: ScheduledMail[]) {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  const prefs = { ...((s?.prefs as Record<string, unknown> | null) ?? {}), scheduled };
  await prisma.webmailSettings.upsert({ where: { mailboxId }, create: { mailboxId, prefs: j(prefs) }, update: { prefs: j(prefs) } });
}

export async function schedule(
  creds: WebmailCreds,
  msg: Omit<ScheduledMail, "id" | "createdAt" | "scheduledAt">,
  scheduledAt: Date,
): Promise<ScheduledMail> {
  const list = await read(creds.mailboxId);
  const entry: ScheduledMail = {
    ...msg,
    id: randomToken(8),
    scheduledAt: scheduledAt.toISOString(),
    createdAt: new Date().toISOString(),
  };
  await write(creds.mailboxId, [...list, entry]);
  return entry;
}

/** Deliver any scheduled mail whose time has arrived; returns how many were sent. */
export async function flushDue(creds: WebmailCreds): Promise<number> {
  const list = await read(creds.mailboxId);
  if (list.length === 0) return 0;
  const now = Date.now();
  const due = list.filter((m) => new Date(m.scheduledAt).getTime() <= now);
  if (due.length === 0) return 0;

  for (const m of due) {
    const attachments = m.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.contentBase64, "base64"),
      contentType: a.contentType,
    }));
    await sendMail(creds, { to: m.to, cc: m.cc, bcc: m.bcc, subject: m.subject, html: m.html, text: m.text, attachments }).catch(() => {});
  }
  await write(creds.mailboxId, list.filter((m) => new Date(m.scheduledAt).getTime() > now));
  return due.length;
}

/** Flush due items, then return the still-pending list (newest first). */
export async function listScheduled(creds: WebmailCreds): Promise<ScheduledMail[]> {
  await flushDue(creds);
  const list = await read(creds.mailboxId);
  return [...list].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

export async function cancel(creds: WebmailCreds, id: string): Promise<{ ok: boolean }> {
  const list = await read(creds.mailboxId);
  await write(creds.mailboxId, list.filter((m) => m.id !== id));
  return { ok: true };
}
