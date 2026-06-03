import { prisma, type Prisma } from "@ezmails/db";
import { withImap } from "../lib/imap.js";
import type { WebmailCreds } from "../lib/session.js";
import { env } from "../config/env.js";

export interface AutoCleanRule { folder: string; olderThanDays: number; action: "trash" | "delete" }

const THROTTLE_MS = 12 * 60 * 60 * 1000; // auto-run at most twice a day

/** Apply auto-clean rules now, using the caller's live IMAP session. */
export async function runAutoClean(creds: WebmailCreds, rules: AutoCleanRule[]): Promise<{ cleaned: number }> {
  if (env.WEBMAIL_DEV_BYPASS_IMAP) return { cleaned: 0 };
  let cleaned = 0;
  await withImap(creds, async (c) => {
    const boxes = await c.list();
    const trash = boxes.find((b) => b.specialUse === "\\Trash")?.path ?? "Trash";
    for (const rule of rules) {
      const days = Number(rule.olderThanDays);
      if (!rule.folder || !days || days < 1) continue;
      const before = new Date(Date.now() - days * 86400000);
      let lock;
      try {
        lock = await c.getMailboxLock(rule.folder);
      } catch {
        continue;
      }
      try {
        const uids = (await c.search({ before }, { uid: true })) || [];
        if (!uids.length) continue;
        const uidSet = uids.join(",");
        if (rule.action === "delete" || rule.folder === trash) {
          await c.messageDelete({ uid: uidSet }, { uid: true });
        } else {
          await c.messageMove({ uid: uidSet }, trash, { uid: true });
        }
        cleaned += uids.length;
      } catch {
        /* skip a problematic folder */
      } finally {
        lock.release();
      }
    }
  });
  return { cleaned };
}

/** Auto-run on inbox open if enabled and not run in the last 12h. Fire-and-forget. */
export async function maybeAutoClean(creds: WebmailCreds, mailboxId: string): Promise<void> {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  const prefs = (s?.prefs as Record<string, unknown> | null) ?? {};
  const ac = prefs.autoClean as { enabled?: boolean; rules?: AutoCleanRule[]; lastRunAt?: string } | undefined;
  if (!ac?.enabled || !Array.isArray(ac.rules) || ac.rules.length === 0) return;
  const last = ac.lastRunAt ? new Date(ac.lastRunAt).getTime() : 0;
  if (Date.now() - last < THROTTLE_MS) return;

  await runAutoClean(creds, ac.rules).catch(() => {});
  const nextPrefs = { ...prefs, autoClean: { ...ac, lastRunAt: new Date().toISOString() } } as unknown as Prisma.InputJsonValue;
  await prisma.webmailSettings.update({ where: { mailboxId }, data: { prefs: nextPrefs } }).catch(() => {});
}
