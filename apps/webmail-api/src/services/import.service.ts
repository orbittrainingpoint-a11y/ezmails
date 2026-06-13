// IMAP → IMAP mailbox import (e.g. migrate from Titan/Hostinger to ezmails).
// Connects to the SOURCE account, copies messages folder-by-folder into the
// logged-in user's mailbox via the local Dovecot. Idempotent: messages whose
// Message-ID already exists in the destination folder are skipped, so it's safe
// to re-run. Bounded per folder to stay within request timeouts — for very large
// mailboxes the CLI `imapsync` is still the heavy-duty tool (see DEPLOY/migration docs).
import { ImapFlow } from "imapflow";
import { env } from "../config/env.js";
import { openImap } from "../lib/imap.js";
import { assertPublicHost } from "../lib/ssrf.js";
import type { WebmailCreds } from "../lib/session.js";

export interface ImportSource {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export interface ImportResult {
  folders: { folder: string; copied: number; skipped: number }[];
  copiedTotal: number;
  capped: boolean;
}

/** Map a source folder to the destination folder name. */
function mapFolder(path: string, specialUse?: string): string {
  const su = specialUse ?? "";
  if (/^inbox$/i.test(path) || su === "\\Inbox") return "INBOX";
  if (su === "\\Sent" || /sent/i.test(path)) return "Sent";
  if (su === "\\Drafts" || /draft/i.test(path)) return "Drafts";
  if (su === "\\Junk" || /junk|spam/i.test(path)) return "Junk";
  if (su === "\\Trash" || /trash|deleted/i.test(path)) return "Trash";
  if (su === "\\Archive" || /archive/i.test(path)) return "Archive";
  return path.replace(/^INBOX[./]/i, ""); // keep custom names, strip INBOX prefix
}

const KEEP_FLAGS = new Set(["\\Seen", "\\Flagged", "\\Answered", "\\Draft"]);

export async function importFromImap(
  creds: WebmailCreds,
  source: ImportSource,
  opts: { maxPerFolder?: number } = {},
): Promise<ImportResult> {
  if (env.WEBMAIL_DEV_BYPASS_IMAP) {
    throw new Error("Import requires a live mail server (unavailable in dev mode).");
  }
  const maxPerFolder = Math.min(opts.maxPerFolder ?? 2000, 5000);

  // SSRF guard: never let a user point the importer at internal infrastructure.
  await assertPublicHost(source.host);

  const src = new ImapFlow({
    host: source.host,
    port: source.port,
    secure: source.secure,
    auth: { user: source.user, pass: source.password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  await src.connect();
  const dest = await openImap(creds);

  const folders: ImportResult["folders"] = [];
  let capped = false;

  try {
    const boxes = await src.list();
    for (const box of boxes) {
      if (box.flags?.has("\\Noselect")) continue;
      const destName = mapFolder(box.path, box.specialUse ?? undefined);

      if (destName !== "INBOX") {
        await dest.mailboxCreate(destName).catch(() => undefined); // ignore "already exists"
      }

      // Existing Message-IDs in the destination → dedup.
      const existing = new Set<string>();
      let dlock = await dest.getMailboxLock(destName).catch(() => null);
      if (dlock) {
        try {
          const dboxExists = (dest.mailbox && typeof dest.mailbox === "object" ? dest.mailbox.exists : 0) || 0;
          if (dboxExists > 0) {
            for await (const m of dest.fetch("1:*", { envelope: true })) {
              if (m.envelope?.messageId) existing.add(m.envelope.messageId);
            }
          }
        } finally {
          dlock.release();
        }
      }

      // Copy newest up to maxPerFolder from the source folder.
      let copied = 0;
      let skipped = 0;
      const slock = await src.getMailboxLock(box.path).catch(() => null);
      if (slock) {
        try {
          const total = (src.mailbox && typeof src.mailbox === "object" ? src.mailbox.exists : 0) || 0;
          if (total > maxPerFolder) capped = true;
          if (total > 0) {
            const start = Math.max(1, total - maxPerFolder + 1);
            for await (const msg of src.fetch(`${start}:*`, { source: true, envelope: true, flags: true, internalDate: true })) {
              const mid = msg.envelope?.messageId;
              if (mid && existing.has(mid)) { skipped++; continue; }
              if (!msg.source) { skipped++; continue; }
              const flags = msg.flags ? Array.from(msg.flags).filter((f) => KEEP_FLAGS.has(f)) : undefined;
              await dest.append(destName, msg.source, flags, msg.internalDate).catch(() => { skipped++; });
              copied++;
            }
          }
        } finally {
          slock.release();
        }
      }
      folders.push({ folder: destName, copied, skipped });
    }
  } finally {
    await src.logout().catch(() => src.close());
    await dest.logout().catch(() => dest.close());
  }

  return { folders, copiedTotal: folders.reduce((a, f) => a + f.copied, 0), capped };
}
