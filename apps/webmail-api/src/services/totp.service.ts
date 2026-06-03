import { authenticator } from "otplib";
import QRCode from "qrcode";
import { randomInt } from "node:crypto";
import { prisma } from "@ezmails/db";
import { encrypt, decrypt, sha256 } from "../lib/crypto.js";

const ISSUER = "Infinit Email";

function recoveryCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const g = () => Array.from({ length: 4 }, () => a[randomInt(a.length)]).join("");
  return `${g()}-${g()}`;
}

/** Begin 2FA enrollment (Google Authenticator). Returns QR + recovery codes. */
export async function setupTotp(mailboxId: string, email: string) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  const codes = Array.from({ length: 10 }, () => recoveryCode());
  await prisma.webmailSettings.upsert({
    where: { mailboxId },
    create: { mailboxId, totpSecret: encrypt(secret), totpEnabled: false, recoveryCodes: codes.map(sha256) },
    update: { totpSecret: encrypt(secret), totpEnabled: false, recoveryCodes: codes.map(sha256) },
  });

  return { otpauth, qrDataUrl, recoveryCodes: codes };
}

/** Verify a code and enable 2FA. */
export async function verifyAndEnable(mailboxId: string, code: string): Promise<boolean> {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  if (!s?.totpSecret) return false;
  if (!authenticator.verify({ token: code, secret: decrypt(s.totpSecret) })) return false;
  await prisma.webmailSettings.update({ where: { mailboxId }, data: { totpEnabled: true } });
  return true;
}

export async function disableTotp(mailboxId: string): Promise<void> {
  await prisma.webmailSettings.update({
    where: { mailboxId },
    data: { totpEnabled: false, totpSecret: null, recoveryCodes: undefined },
  });
}

export async function isTotpEnabled(mailboxId: string): Promise<boolean> {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId }, select: { totpEnabled: true } });
  return !!s?.totpEnabled;
}

/** Verify a login-time code (TOTP or a one-time recovery code). */
export async function verifyLoginCode(mailboxId: string, code: string): Promise<boolean> {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  if (!s?.totpSecret) return false;

  if (authenticator.verify({ token: code.trim(), secret: decrypt(s.totpSecret) })) return true;

  // Recovery code path (single use).
  const codes = (s.recoveryCodes as string[] | null) ?? [];
  const hash = sha256(code.trim().toUpperCase());
  if (codes.includes(hash)) {
    await prisma.webmailSettings.update({
      where: { mailboxId },
      data: { recoveryCodes: codes.filter((c) => c !== hash) },
    });
    return true;
  }
  return false;
}
