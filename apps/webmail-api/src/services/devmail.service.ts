// Database-backed mail store used when no real IMAP/SMTP server is available
// (WEBMAIL_DEV_BYPASS_IMAP). Implements the same surface as mail.service so the
// whole webmail — folders, reading, flags, move, and SENDING between local
// mailboxes — works in the local demo without Postfix/Dovecot.
import { prisma, type Prisma } from "@ezmails/db";
import { randomToken } from "../lib/crypto.js";
import type { WebmailCreds } from "../lib/session.js";
import type { OutgoingAttachment } from "../lib/smtp.js";

interface Addr { name?: string; address: string }
interface StoredAtt { filename: string; contentType: string; contentBase64: string }

// Prisma's Json input type rejects typed arrays; this narrows the cast in one place.
const j = (v: unknown) => v as unknown as Prisma.InputJsonValue;

const STD = [
  { path: "INBOX", name: "Inbox", specialUse: "\\Inbox" },
  { path: "Sent", name: "Sent", specialUse: "\\Sent" },
  { path: "Drafts", name: "Drafts", specialUse: "\\Drafts" },
  { path: "Junk", name: "Spam", specialUse: "\\Junk" },
  { path: "Archive", name: "Archive", specialUse: "\\Archive" },
  { path: "Trash", name: "Trash", specialUse: "\\Trash" },
  { path: "Important", name: "Important", specialUse: null },
];

async function customFolders(mailboxId: string): Promise<{ path: string; name: string }[]> {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  return (((s?.prefs as { folders?: { path: string; name: string }[] } | null)?.folders) ?? []);
}
async function setCustomFolders(mailboxId: string, folders: { path: string; name: string }[]) {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  const prefs = { ...((s?.prefs as Record<string, unknown> | null) ?? {}), folders };
  await prisma.webmailSettings.upsert({ where: { mailboxId }, create: { mailboxId, prefs }, update: { prefs } });
}

async function nextUid(mailboxId: string): Promise<number> {
  const max = await prisma.devMail.aggregate({ where: { mailboxId }, _max: { uid: true } });
  return (max._max.uid ?? 0) + 1;
}

export async function listFolders(creds: WebmailCreds) {
  const custom = await customFolders(creds.mailboxId);
  return [...STD, ...custom.map((c) => ({ path: c.path, name: c.name, specialUse: null }))].map((f) => ({
    ...f,
    subscribed: true,
  }));
}

/** Unread (and total) counts per folder, keyed by folder path. */
export async function folderCounts(creds: WebmailCreds): Promise<Record<string, { unread: number; total: number }>> {
  const grouped = await prisma.devMail.groupBy({
    by: ["folder"],
    where: { mailboxId: creds.mailboxId },
    _count: { _all: true },
  });
  const unread = await prisma.devMail.groupBy({
    by: ["folder"],
    where: { mailboxId: creds.mailboxId, seen: false },
    _count: { _all: true },
  });
  const unreadMap = new Map(unread.map((u) => [u.folder, u._count._all]));
  const out: Record<string, { unread: number; total: number }> = {};
  for (const g of grouped) out[g.folder] = { total: g._count._all, unread: unreadMap.get(g.folder) ?? 0 };
  // Starred = flagged across mailbox (virtual folder).
  const starred = await prisma.devMail.count({ where: { mailboxId: creds.mailboxId, flagged: true } });
  out["__starred"] = { total: starred, unread: 0 };
  return out;
}

export async function createFolder(creds: WebmailCreds, path: string) {
  const custom = await customFolders(creds.mailboxId);
  if (!STD.some((s) => s.path === path) && !custom.some((c) => c.path === path)) {
    custom.push({ path, name: path });
    await setCustomFolders(creds.mailboxId, custom);
  }
  return { path };
}
export async function deleteFolder(creds: WebmailCreds, path: string) {
  await setCustomFolders(creds.mailboxId, (await customFolders(creds.mailboxId)).filter((c) => c.path !== path));
  await prisma.devMail.deleteMany({ where: { mailboxId: creds.mailboxId, folder: path } });
  return { path };
}
export async function renameFolder(creds: WebmailCreds, path: string, newPath: string) {
  const custom = (await customFolders(creds.mailboxId)).map((c) => (c.path === path ? { path: newPath, name: newPath } : c));
  await setCustomFolders(creds.mailboxId, custom);
  await prisma.devMail.updateMany({ where: { mailboxId: creds.mailboxId, folder: path }, data: { folder: newPath } });
  return { path: newPath };
}

function listItem(m: {
  uid: number; subject: string; fromName: string | null; fromAddr: string; toJson: unknown;
  createdAt: Date; html: string | null; text: string | null; seen: boolean; flagged: boolean; attachments: unknown;
}) {
  return {
    uid: m.uid,
    subject: m.subject || "(no subject)",
    from: [{ name: m.fromName ?? "", address: m.fromAddr }],
    to: (m.toJson as unknown as Addr[]) ?? [],
    date: m.createdAt,
    size: (m.html ?? m.text ?? "").length,
    seen: m.seen,
    flagged: m.flagged,
    answered: false,
    hasAttachments: Array.isArray(m.attachments) && (m.attachments as unknown[]).length > 0,
  };
}

export async function listMessages(creds: WebmailCreds, opts: { folder: string; page: number; pageSize: number; search?: string }) {
  const where = {
    mailboxId: creds.mailboxId,
    folder: opts.folder,
    ...(opts.search
      ? { OR: [{ subject: { contains: opts.search, mode: "insensitive" as const } }, { fromAddr: { contains: opts.search.toLowerCase() } }, { fromName: { contains: opts.search, mode: "insensitive" as const } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.devMail.findMany({ where, orderBy: { createdAt: "desc" }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize }),
    prisma.devMail.count({ where }),
  ]);
  return { items: rows.map(listItem), total, page: opts.page, pageSize: opts.pageSize };
}

export async function getMessage(creds: WebmailCreds, folder: string, uid: number, markSeen: boolean) {
  const m = await prisma.devMail.findFirst({ where: { mailboxId: creds.mailboxId, folder, uid } });
  if (!m) return null;
  if (markSeen && !m.seen) await prisma.devMail.update({ where: { id: m.id }, data: { seen: true } });
  const atts = (m.attachments as unknown as StoredAtt[] | null) ?? [];
  return {
    uid: m.uid,
    messageId: m.messageId,
    subject: m.subject || "(no subject)",
    from: [{ name: m.fromName ?? "", address: m.fromAddr }],
    to: (m.toJson as unknown as Addr[]) ?? [],
    cc: (m.ccJson as unknown as Addr[] | null) ?? [],
    date: m.createdAt,
    html: m.html,
    text: m.text,
    headers: { from: m.fromAddr, subject: m.subject },
    attachments: atts.map((a, i) => ({ index: i, filename: a.filename, contentType: a.contentType, size: Buffer.from(a.contentBase64, "base64").length })),
    flags: [m.seen ? "\\Seen" : "", m.flagged ? "\\Flagged" : ""].filter(Boolean),
  };
}

export async function getAttachment(creds: WebmailCreds, folder: string, uid: number, index: number) {
  const m = await prisma.devMail.findFirst({ where: { mailboxId: creds.mailboxId, folder, uid } });
  const att = ((m?.attachments as unknown as StoredAtt[] | null) ?? [])[index];
  if (!att) return null;
  return { filename: att.filename, contentType: att.contentType, content: Buffer.from(att.contentBase64, "base64") };
}

export async function setFlags(creds: WebmailCreds, folder: string, uid: number, changes: { seen?: boolean; flagged?: boolean }) {
  await prisma.devMail.updateMany({ where: { mailboxId: creds.mailboxId, folder, uid }, data: changes });
  return { ok: true };
}

export async function moveMessage(creds: WebmailCreds, folder: string, uid: number, target: string) {
  await prisma.devMail.updateMany({ where: { mailboxId: creds.mailboxId, folder, uid }, data: { folder: target } });
  return { ok: true };
}

export async function trashMessage(creds: WebmailCreds, folder: string, uid: number) {
  if (folder === "Trash") await prisma.devMail.deleteMany({ where: { mailboxId: creds.mailboxId, folder, uid } });
  else await prisma.devMail.updateMany({ where: { mailboxId: creds.mailboxId, folder, uid }, data: { folder: "Trash" } });
  return { ok: true };
}

export async function send(
  creds: WebmailCreds,
  message: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; html?: string; text?: string; attachments?: OutgoingAttachment[] },
) {
  const messageId = `<${randomToken(12)}@ezmails.local>`;
  const stored: StoredAtt[] = (message.attachments ?? []).map((a) => ({ filename: a.filename, contentType: a.contentType ?? "application/octet-stream", contentBase64: a.content.toString("base64") }));
  const sender = await prisma.mailbox.findUnique({ where: { id: creds.mailboxId } });
  const fromName = sender?.displayName ?? null;
  const toAddrs: Addr[] = message.to.map((a) => ({ address: a }));
  const ccAddrs: Addr[] = (message.cc ?? []).map((a) => ({ address: a }));

  // Copy in the sender's Sent.
  await prisma.devMail.create({
    data: {
      mailboxId: creds.mailboxId, folder: "Sent", uid: await nextUid(creds.mailboxId), messageId,
      fromName, fromAddr: creds.email, toJson: j(toAddrs), ccJson: j(ccAddrs), subject: message.subject,
      html: message.html ?? null, text: message.text ?? null, seen: true, attachments: j(stored),
    },
  });

  // Deliver to any local recipients' INBOX.
  const recipients = [...message.to, ...(message.cc ?? []), ...(message.bcc ?? [])].map((e) => e.toLowerCase());
  for (const addr of new Set(recipients)) {
    const mb = await prisma.mailbox.findUnique({ where: { email: addr } });
    if (!mb || mb.status !== "active") continue;
    await prisma.devMail.create({
      data: {
        mailboxId: mb.id, folder: "INBOX", uid: await nextUid(mb.id), messageId,
        fromName, fromAddr: creds.email, toJson: j(toAddrs), ccJson: j(ccAddrs), subject: message.subject,
        html: message.html ?? null, text: message.text ?? null, seen: false, attachments: j(stored),
      },
    });
  }
  return { messageId };
}

export async function saveDraft(
  creds: WebmailCreds,
  message: { to?: string[]; cc?: string[]; bcc?: string[]; subject?: string; html?: string; text?: string; attachments?: OutgoingAttachment[] },
) {
  const messageId = `<${randomToken(12)}@ezmails.local>`;
  const stored: StoredAtt[] = (message.attachments ?? []).map((a) => ({ filename: a.filename, contentType: a.contentType ?? "application/octet-stream", contentBase64: a.content.toString("base64") }));
  const sender = await prisma.mailbox.findUnique({ where: { id: creds.mailboxId } });
  await prisma.devMail.create({
    data: {
      mailboxId: creds.mailboxId, folder: "Drafts", uid: await nextUid(creds.mailboxId), messageId,
      fromName: sender?.displayName ?? null, fromAddr: creds.email,
      toJson: j((message.to ?? []).map((a) => ({ address: a }))), ccJson: j((message.cc ?? []).map((a) => ({ address: a }))),
      subject: message.subject ?? "", html: message.html ?? null, text: message.text ?? null, seen: true, attachments: j(stored),
    },
  });
  return { ok: true };
}
