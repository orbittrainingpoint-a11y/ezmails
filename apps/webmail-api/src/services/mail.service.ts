import { simpleParser } from "mailparser";
import type { ImapFlow } from "imapflow";
import { prisma } from "@ezmails/db";
import { withImap } from "../lib/imap.js";
import { sendMail, buildRawMessage, type OutgoingAttachment } from "../lib/smtp.js";
import type { WebmailCreds } from "../lib/session.js";
import { env } from "../config/env.js";
import * as dev from "./devmail.service.js";

// In dev (no IMAP/SMTP server), back every operation with the Postgres dev store.
const DEV = env.WEBMAIL_DEV_BYPASS_IMAP;

/** True if any MIME part is an attachment disposition. */
function hasAttachments(node: unknown): boolean {
  const n = node as { disposition?: string; childNodes?: unknown[] } | undefined;
  if (!n) return false;
  if (n.disposition === "attachment") return true;
  return Array.isArray(n.childNodes) ? n.childNodes.some(hasAttachments) : false;
}

function addr(list?: { name?: string; address?: string }[]) {
  return (list ?? []).map((a) => ({ name: a.name ?? "", address: a.address ?? "" }));
}

// ── Folders (WM-018/019) ──
export async function listFolders(creds: WebmailCreds) {
  if (DEV) return dev.listFolders(creds);
  return withImap(creds, async (c) => {
    const boxes = await c.list();
    return boxes.map((b) => ({
      path: b.path,
      name: b.name,
      specialUse: b.specialUse ?? null,
      subscribed: b.subscribed ?? true,
    }));
  });
}

/** Per-folder { unread, total } counts. Dev store groups in SQL; IMAP uses STATUS. */
export async function folderCounts(creds: WebmailCreds): Promise<Record<string, { unread: number; total: number }>> {
  if (DEV) return dev.folderCounts(creds);
  return withImap(creds, async (c) => {
    const boxes = await c.list();
    const out: Record<string, { unread: number; total: number }> = {};
    for (const b of boxes) {
      try {
        const st = await c.status(b.path, { unseen: true, messages: true });
        out[b.path] = { unread: st.unseen ?? 0, total: st.messages ?? 0 };
      } catch {
        /* skip unselectable folders */
      }
    }
    return out;
  });
}

export async function createFolder(creds: WebmailCreds, path: string) {
  if (DEV) return dev.createFolder(creds, path);
  return withImap(creds, async (c) => {
    await c.mailboxCreate(path);
    return { path };
  });
}

export async function deleteFolder(creds: WebmailCreds, path: string) {
  if (DEV) return dev.deleteFolder(creds, path);
  return withImap(creds, async (c) => {
    await c.mailboxDelete(path);
    return { path };
  });
}

export async function renameFolder(creds: WebmailCreds, path: string, newPath: string) {
  if (DEV) return dev.renameFolder(creds, path, newPath);
  return withImap(creds, async (c) => {
    await c.mailboxRename(path, newPath);
    return { path: newPath };
  });
}

// ── Message list (WM-002) ──
export async function listMessages(
  creds: WebmailCreds,
  opts: { folder: string; page: number; pageSize: number; search?: string },
) {
  if (DEV) return dev.listMessages(creds, opts);
  return withImap(creds, async (c) => {
    const lock = await c.getMailboxLock(opts.folder);
    try {
      const status = c.mailbox && typeof c.mailbox === "object" ? c.mailbox : null;
      const total = status ? status.exists : 0;

      let uids: number[] | null = null;
      if (opts.search) {
        uids = (await c.search({ or: [{ from: opts.search }, { subject: opts.search }, { body: opts.search }] }, { uid: true })) || [];
        uids = uids.slice().reverse();
      }

      const items: unknown[] = [];
      if (uids) {
        const pageUids = uids.slice((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize);
        if (pageUids.length) {
          for await (const msg of c.fetch({ uid: pageUids.join(",") }, { uid: true, envelope: true, flags: true, size: true, bodyStructure: true }, { uid: true })) {
            items.push(serializeListItem(msg));
          }
        }
        return { items: items.reverse(), total: uids.length, page: opts.page, pageSize: opts.pageSize };
      }

      if (total === 0) return { items: [], total: 0, page: opts.page, pageSize: opts.pageSize };
      const end = total - (opts.page - 1) * opts.pageSize;
      const start = Math.max(1, end - opts.pageSize + 1);
      if (end < 1) return { items: [], total, page: opts.page, pageSize: opts.pageSize };

      for await (const msg of c.fetch(`${start}:${end}`, { uid: true, envelope: true, flags: true, size: true, bodyStructure: true })) {
        items.push(serializeListItem(msg));
      }
      return { items: items.reverse(), total, page: opts.page, pageSize: opts.pageSize };
    } finally {
      lock.release();
    }
  });
}

function serializeListItem(msg: {
  uid: number;
  envelope?: { subject?: string; from?: { name?: string; address?: string }[]; to?: { name?: string; address?: string }[]; date?: Date };
  flags?: Set<string>;
  size?: number;
  bodyStructure?: unknown;
}) {
  const flags = msg.flags ? Array.from(msg.flags) : [];
  return {
    uid: msg.uid,
    subject: msg.envelope?.subject ?? "(no subject)",
    from: addr(msg.envelope?.from),
    to: addr(msg.envelope?.to),
    date: msg.envelope?.date ?? null,
    size: msg.size ?? 0,
    seen: flags.includes("\\Seen"),
    flagged: flags.includes("\\Flagged"),
    answered: flags.includes("\\Answered"),
    hasAttachments: hasAttachments(msg.bodyStructure),
  };
}

// ── Message read (WM-005/006/007/008) ──
export async function getMessage(creds: WebmailCreds, folder: string, uid: number, markSeen: boolean) {
  if (DEV) return dev.getMessage(creds, folder, uid, markSeen);
  return withImap(creds, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const msg = await c.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
      if (!msg) return null;
      const source = msg.source;
      if (!source) return null;
      const parsed = await simpleParser(source);
      if (markSeen) await c.messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true }).catch(() => {});

      return {
        uid,
        messageId: parsed.messageId ?? `uid-${uid}`, // stable key for notes
        subject: parsed.subject ?? "(no subject)",
        from: addr(parsed.from?.value as { name?: string; address?: string }[]),
        to: addr(parsed.to ? (Array.isArray(parsed.to) ? parsed.to.flatMap((t) => t.value) : parsed.to.value) : []),
        cc: addr(parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc.flatMap((t) => t.value) : parsed.cc.value) : []),
        date: parsed.date ?? null,
        html: parsed.html || null,
        text: parsed.text ?? null,
        headers: Object.fromEntries(parsed.headerLines.map((h) => [h.key, h.line])),
        attachments: parsed.attachments.map((a, i) => ({
          index: i,
          filename: a.filename ?? `attachment-${i}`,
          contentType: a.contentType,
          size: a.size,
        })),
        flags: msg.flags ? Array.from(msg.flags) : [],
      };
    } finally {
      lock.release();
    }
  });
}

export async function getAttachment(creds: WebmailCreds, folder: string, uid: number, index: number) {
  if (DEV) return dev.getAttachment(creds, folder, uid, index);
  return withImap(creds, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const msg = await c.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      if (!msg) return null;
      const source = msg.source;
      if (!source) return null;
      const parsed = await simpleParser(source);
      const att = parsed.attachments[index];
      if (!att) return null;
      return { filename: att.filename ?? `attachment-${index}`, contentType: att.contentType, content: att.content as Buffer };
    } finally {
      lock.release();
    }
  });
}

// ── Flags / move / delete (WM-020) ──
export async function setFlags(creds: WebmailCreds, folder: string, uid: number, changes: { seen?: boolean; flagged?: boolean }) {
  if (DEV) return dev.setFlags(creds, folder, uid, changes);
  return withImap(creds, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      if (changes.seen !== undefined)
        await c[changes.seen ? "messageFlagsAdd" : "messageFlagsRemove"]({ uid: String(uid) }, ["\\Seen"], { uid: true });
      if (changes.flagged !== undefined)
        await c[changes.flagged ? "messageFlagsAdd" : "messageFlagsRemove"]({ uid: String(uid) }, ["\\Flagged"], { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

async function findSpecial(c: ImapFlow, use: string, fallback: string): Promise<string> {
  const boxes = await c.list();
  return boxes.find((b) => b.specialUse === use)?.path ?? fallback;
}

export async function moveMessage(creds: WebmailCreds, folder: string, uid: number, target: string) {
  if (DEV) return dev.moveMessage(creds, folder, uid, target);
  return withImap(creds, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      await c.messageMove({ uid: String(uid) }, target, { uid: true });
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

export async function trashMessage(creds: WebmailCreds, folder: string, uid: number) {
  if (DEV) return dev.trashMessage(creds, folder, uid);
  return withImap(creds, async (c) => {
    const trash = await findSpecial(c, "\\Trash", "Trash");
    const lock = await c.getMailboxLock(folder);
    try {
      if (folder === trash) {
        await c.messageDelete({ uid: String(uid) }, { uid: true });
      } else {
        await c.messageMove({ uid: String(uid) }, trash, { uid: true });
      }
      return { ok: true };
    } finally {
      lock.release();
    }
  });
}

/**
 * Resolve the From header. Defaults to the mailbox's own address (with display
 * name). If `requested` is given it must be the primary address or an active,
 * non-wildcard alias that delivers to this mailbox — otherwise we fall back to
 * the primary address (never let a user spoof an address they don't own).
 */
export async function resolveFrom(mailboxId: string, requested?: string): Promise<string> {
  const mb = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailboxId }, select: { email: true, displayName: true } });
  const name = mb.displayName?.trim();
  const fmt = (addr: string) => (name ? `${name} <${addr}>` : addr);
  const me = mb.email.toLowerCase();
  const want = requested?.trim().toLowerCase();
  if (!want || want === me) return fmt(mb.email);

  const aliases = await prisma.alias.findMany({ where: { isActive: true, isWildcard: false, source: want, destination: { contains: me } } });
  const allowed = aliases.some((a) => a.destination.split(",").map((d) => d.trim().toLowerCase()).includes(me));
  return allowed ? fmt(want) : fmt(mb.email);
}

// ── Send (WM-009…017) ──
export async function send(
  creds: WebmailCreds,
  message: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; html?: string; text?: string; attachments?: OutgoingAttachment[]; from?: string },
) {
  if (DEV) return dev.send(creds, message);
  const { from: requestedFrom, ...rest } = message;
  const fromHeader = await resolveFrom(creds.mailboxId, requestedFrom);
  const result = await sendMail(creds, { from: fromHeader, ...rest });
  // Append an identical copy (with attachments) to Sent, creating the folder if needed.
  await withImap(creds, async (c) => {
    const sent = await findSpecial(c, "\\Sent", "Sent");
    await c.mailboxCreate(sent).catch(() => {}); // ignore "already exists"
    await c.append(sent, result.raw, ["\\Seen"]).catch(() => {});
  }).catch(() => {});
  return { messageId: result.messageId };
}

/**
 * Stream the entire account as a standard mbox file (every folder, every message).
 * Importable into Thunderbird/Apple Mail/another server. Writes to `out` and ends it.
 */
export async function exportMbox(creds: WebmailCreds, out: NodeJS.WritableStream) {
  const writeMsg = (raw: Buffer, when: Date) => {
    out.write(`From MAILER-DAEMON ${when.toUTCString()}\n`);
    // mbox "From " line escaping so message bodies can't be mistaken for separators.
    const escaped = raw.toString("latin1").replace(/\nFrom /g, "\n>From ");
    out.write(Buffer.from(escaped, "latin1"));
    out.write("\n\n");
  };

  if (DEV) {
    // Dev store has no raw RFC822 source to export; production uses real IMAP below.
    out.end();
    return;
  }

  await withImap(creds, async (c) => {
    const boxes = await c.list();
    for (const b of boxes) {
      let lock;
      try {
        lock = await c.getMailboxLock(b.path);
      } catch {
        continue; // unselectable folder
      }
      try {
        const status = c.mailbox && typeof c.mailbox === "object" ? c.mailbox : null;
        if (!status || status.exists === 0) continue;
        for await (const msg of c.fetch("1:*", { uid: true, source: true, envelope: true })) {
          if (msg.source) writeMsg(msg.source, msg.envelope?.date ?? new Date());
        }
      } finally {
        lock.release();
      }
    }
  });
  out.end();
}

/** Save an unsent message to the Drafts folder. */
export async function saveDraft(
  creds: WebmailCreds,
  message: { to?: string[]; cc?: string[]; bcc?: string[]; subject?: string; html?: string; text?: string; attachments?: OutgoingAttachment[] },
) {
  if (DEV) return dev.saveDraft(creds, message);
  const { raw } = await buildRawMessage({
    from: creds.email,
    to: message.to ?? [],
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject ?? "",
    html: message.html,
    text: message.text,
    attachments: message.attachments,
  });
  await withImap(creds, async (c) => {
    const drafts = await findSpecial(c, "\\Drafts", "Drafts");
    await c.mailboxCreate(drafts).catch(() => {});
    await c.append(drafts, raw, ["\\Draft"]).catch(() => {});
  });
  return { ok: true };
}
