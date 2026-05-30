import bcrypt from "bcryptjs";
import { prisma } from "@ezmails/db";
import { AppError } from "../lib/errors.js";

/** Account overview for the logged-in mailbox: identity + storage usage. */
export async function getAccount(mailboxId: string) {
  const mailbox = await prisma.mailbox.findUniqueOrThrow({
    where: { id: mailboxId },
    include: { domain: { select: { domainName: true } } },
  });

  // Approximate used storage from logged message sizes addressed to this mailbox
  // (a real deployment reads Dovecot's quota; this is a reasonable stand-in).
  const agg = await prisma.mailLog.aggregate({
    where: { recipient: mailbox.email },
    _sum: { sizeBytes: true },
  });

  return {
    email: mailbox.email,
    displayName: mailbox.displayName,
    domain: mailbox.domain.domainName,
    createdAt: mailbox.createdAt,
    lastLoginAt: mailbox.lastLoginAt,
    storageUsedBytes: agg._sum.sizeBytes ?? 0,
    storageQuotaBytes: mailbox.quota.toString(),
  };
}

export async function updateDisplayName(mailboxId: string, displayName: string) {
  await prisma.mailbox.update({ where: { id: mailboxId }, data: { displayName } });
  return { displayName };
}

/**
 * Change the mailbox password. Updates the {BLF-CRYPT} hash that Dovecot (and the
 * dev login bypass) authenticate against. The current password must be correct.
 */
export async function changePassword(mailboxId: string, current: string, next: string) {
  if (next.length < 8) throw new AppError(400, "WEAK_PASSWORD", "New password must be at least 8 characters.");
  const mailbox = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
  const ok = await bcrypt.compare(current, mailbox.password.replace(/^\{[^}]+\}/, ""));
  if (!ok) throw new AppError(400, "WRONG_PASSWORD", "Current password is incorrect.");
  const hash = `{BLF-CRYPT}${bcrypt.hashSync(next, 10)}`;
  await prisma.mailbox.update({ where: { id: mailboxId }, data: { password: hash } });
  return { ok: true };
}
