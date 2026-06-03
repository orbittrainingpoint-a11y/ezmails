import bcrypt from "bcryptjs";
import { prisma } from "@ezmails/db";
import { AppError } from "../lib/errors.js";

const MAX_PER_MAILBOX = 20;

// Gmail-style 16-char password shown as four groups of four lowercase letters.
function generateAppPassword(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out; // grouping is applied in the UI for readability
}

/** List a mailbox's app passwords — never returns the secret or its hash. */
export async function listAppPasswords(mailboxId: string) {
  return prisma.mailboxAppPassword.findMany({
    where: { mailboxId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, lastUsedAt: true, createdAt: true },
  });
}

/**
 * Create an app password. Returns the plaintext ONCE — it is bcrypt-hashed with a
 * {BLF-CRYPT} prefix so Dovecot's app-password passdb can verify it via pgcrypto.
 */
export async function createAppPassword(mailboxId: string, label: string) {
  const clean = label.trim();
  if (!clean) throw new AppError(400, "INVALID_LABEL", "Give this app password a name.");

  const active = await prisma.mailboxAppPassword.count({ where: { mailboxId, revokedAt: null } });
  if (active >= MAX_PER_MAILBOX) {
    throw new AppError(400, "TOO_MANY", `You can have at most ${MAX_PER_MAILBOX} app passwords. Revoke an unused one first.`);
  }

  const password = generateAppPassword();
  const passwordHash = `{BLF-CRYPT}${bcrypt.hashSync(password, 10)}`;
  const created = await prisma.mailboxAppPassword.create({
    data: { mailboxId, label: clean.slice(0, 100), passwordHash },
    select: { id: true, label: true, createdAt: true },
  });
  return { ...created, password };
}

/** Revoke (soft-delete) an app password. Scoped to the owning mailbox. */
export async function revokeAppPassword(mailboxId: string, id: string) {
  const { count } = await prisma.mailboxAppPassword.updateMany({
    where: { id, mailboxId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw new AppError(404, "NOT_FOUND", "App password not found.");
  return { revoked: true };
}
