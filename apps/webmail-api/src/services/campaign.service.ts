import { prisma } from "@ezmails/db";
import { randomToken } from "../lib/crypto.js";
import { parseCsvWithHeader } from "../lib/csv.js";
import { sendMail } from "../lib/smtp.js";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import type { WebmailCreds } from "../lib/session.js";

export async function listCampaigns(mailboxId: string) {
  const rows = await prisma.campaign.findMany({
    where: { mailboxId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true } } },
  });
  // Attach open counts.
  return Promise.all(
    rows.map(async (c) => {
      const opened = await prisma.campaignRecipient.count({ where: { campaignId: c.id, openedAt: { not: null } } });
      const sent = await prisma.campaignRecipient.count({ where: { campaignId: c.id, sentAt: { not: null } } });
      return { ...c, recipientCount: c._count.recipients, sent, opened };
    }),
  );
}

export async function getCampaign(mailboxId: string, id: string) {
  const c = await prisma.campaign.findFirst({ where: { id, mailboxId }, include: { recipients: true } });
  if (!c) throw new AppError(404, "NOT_FOUND", "Campaign not found.");
  const opened = c.recipients.filter((r) => r.openedAt).length;
  const sent = c.recipients.filter((r) => r.sentAt).length;
  return { ...c, sent, opened, openRate: sent ? Math.round((opened / sent) * 100) : 0 };
}

export async function createCampaign(mailboxId: string, body: { name: string; subject: string; bodyHtml: string }) {
  return prisma.campaign.create({ data: { mailboxId, ...body } });
}

export async function updateCampaign(mailboxId: string, id: string, body: Record<string, unknown>) {
  const c = await prisma.campaign.findFirst({ where: { id, mailboxId } });
  if (!c) throw new AppError(404, "NOT_FOUND", "Campaign not found.");
  if (c.status === "sent") throw new AppError(409, "ALREADY_SENT", "Sent campaigns can't be edited.");
  return prisma.campaign.update({ where: { id }, data: body });
}

export async function deleteCampaign(mailboxId: string, id: string) {
  await prisma.campaign.deleteMany({ where: { id, mailboxId } });
}

/** Import recipients from CSV (columns: email, name, + any merge fields). */
export async function importRecipients(mailboxId: string, campaignId: string, csv: string) {
  const c = await prisma.campaign.findFirst({ where: { id: campaignId, mailboxId } });
  if (!c) throw new AppError(404, "NOT_FOUND", "Campaign not found.");

  const rows = parseCsvWithHeader(csv);
  const valid = rows.filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r["email"] ?? ""));
  await prisma.campaignRecipient.createMany({
    data: valid.map((r) => {
      const { email, name, ...fields } = r;
      return { campaignId, email: email!.toLowerCase(), name: name || null, fields, openToken: randomToken(24) };
    }),
  });
  return { imported: valid.length, skipped: rows.length - valid.length };
}

function personalize(template: string, r: { name: string | null; email: string; fields: unknown }): string {
  const data: Record<string, string> = { name: r.name ?? "", email: r.email, ...((r.fields as Record<string, string>) ?? {}) };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => data[k.toLowerCase()] ?? "");
}

/** Send a campaign to all pending recipients, embedding an open-tracking pixel. */
export async function sendCampaign(creds: WebmailCreds, mailboxId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, mailboxId }, include: { recipients: true } });
  if (!campaign) throw new AppError(404, "NOT_FOUND", "Campaign not found.");
  const pending = campaign.recipients.filter((r) => r.status === "pending");
  if (pending.length === 0) throw new AppError(400, "NO_RECIPIENTS", "No pending recipients to send to.");

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "sending" } });

  let sent = 0;
  for (const r of pending) {
    const pixel = `<img src="${env.PUBLIC_BASE_URL}/webmail-api/public/track/open/${r.openToken}" width="1" height="1" alt="" style="display:none" />`;
    const html = personalize(campaign.bodyHtml, r) + pixel;
    try {
      // In dev (no SMTP server) we record the send without dispatching.
      if (!env.WEBMAIL_DEV_BYPASS_IMAP) {
        await sendMail(creds, { from: creds.email, to: [r.email], subject: personalize(campaign.subject, r), html });
      }
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "sent", sentAt: new Date() } });
      sent++;
    } catch {
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "failed" } });
    }
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "sent", sentAt: new Date() } });
  return { sent, total: pending.length };
}

/** Public: mark a recipient as opened (called by the tracking pixel). */
export async function markOpened(token: string): Promise<void> {
  await prisma.campaignRecipient.updateMany({
    where: { openToken: token, openedAt: null },
    data: { openedAt: new Date(), status: "opened" },
  });
}
