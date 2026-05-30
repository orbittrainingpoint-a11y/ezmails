import { prisma } from "@ezmails/db";
import { withImap } from "../lib/imap.js";
import { env } from "../config/env.js";
import type { WebmailCreds } from "../lib/session.js";

export interface RuleCondition {
  field: "from" | "to" | "subject" | "body";
  op: "contains" | "equals" | "startsWith";
  value: string;
}

export async function listRules(mailboxId: string) {
  return prisma.webmailRule.findMany({ where: { mailboxId }, orderBy: { sortOrder: "asc" } });
}

export async function createRule(
  mailboxId: string,
  body: { name: string; matchType: "all" | "any"; conditions: RuleCondition[]; targetFolder: string; markRead?: boolean },
) {
  const count = await prisma.webmailRule.count({ where: { mailboxId } });
  return prisma.webmailRule.create({
    data: {
      mailboxId,
      name: body.name,
      matchType: body.matchType,
      conditions: body.conditions as object[],
      targetFolder: body.targetFolder,
      markRead: body.markRead ?? false,
      sortOrder: count,
    },
  });
}

export async function updateRule(mailboxId: string, id: string, body: Record<string, unknown>) {
  await prisma.webmailRule.updateMany({ where: { id, mailboxId }, data: body });
  return prisma.webmailRule.findUnique({ where: { id } });
}

export async function deleteRule(mailboxId: string, id: string) {
  await prisma.webmailRule.deleteMany({ where: { id, mailboxId } });
}

function matchesRule(
  rule: { matchType: string; conditions: unknown },
  msg: { from: string; to: string; subject: string },
): boolean {
  const conds = (rule.conditions as RuleCondition[]) ?? [];
  if (conds.length === 0) return false;
  const test = (c: RuleCondition): boolean => {
    const hay = (c.field === "from" ? msg.from : c.field === "to" ? msg.to : c.field === "subject" ? msg.subject : "").toLowerCase();
    const v = c.value.toLowerCase();
    if (c.op === "equals") return hay === v;
    if (c.op === "startsWith") return hay.startsWith(v);
    return hay.includes(v);
  };
  return rule.matchType === "any" ? conds.some(test) : conds.every(test);
}

/**
 * Apply all enabled rules to a source folder (default INBOX): move matching
 * messages to each rule's target folder, optionally marking them read.
 */
export async function applyRules(creds: WebmailCreds, mailboxId: string, sourceFolder = "INBOX") {
  const rules = (await prisma.webmailRule.findMany({ where: { mailboxId, enabled: true }, orderBy: { sortOrder: "asc" } }));
  if (rules.length === 0) return { moved: 0 };

  // Dev mail store: apply rules against DevMail rows directly.
  if (env.WEBMAIL_DEV_BYPASS_IMAP) {
    const rows = await prisma.devMail.findMany({ where: { mailboxId, folder: sourceFolder } });
    let moved = 0;
    for (const m of rows) {
      const to = ((m.toJson as { address?: string }[] | null) ?? []).map((a) => a.address ?? "").join(" ");
      const rule = rules.find((r) => r.targetFolder !== sourceFolder && matchesRule(r, { from: m.fromAddr, to, subject: m.subject }));
      if (!rule) continue;
      await prisma.devMail.update({ where: { id: m.id }, data: { folder: rule.targetFolder, ...(rule.markRead ? { seen: true } : {}) } });
      moved++;
    }
    return { moved };
  }

  return withImap(creds, async (c) => {
    const lock = await c.getMailboxLock(sourceFolder);
    let moved = 0;
    try {
      const items: { uid: number; from: string; to: string; subject: string }[] = [];
      for await (const m of c.fetch("1:*", { uid: true, envelope: true })) {
        items.push({
          uid: m.uid,
          subject: m.envelope?.subject ?? "",
          from: (m.envelope?.from ?? []).map((a) => a.address ?? "").join(" "),
          to: (m.envelope?.to ?? []).map((a) => a.address ?? "").join(" "),
        });
      }
      for (const msg of items) {
        const rule = rules.find((r) => r.targetFolder !== sourceFolder && matchesRule(r, msg));
        if (!rule) continue;
        if (rule.markRead) await c.messageFlagsAdd({ uid: String(msg.uid) }, ["\\Seen"], { uid: true }).catch(() => {});
        await c.messageMove({ uid: String(msg.uid) }, rule.targetFolder, { uid: true }).catch(() => {});
        moved++;
      }
    } finally {
      lock.release();
    }
    return { moved };
  });
}
