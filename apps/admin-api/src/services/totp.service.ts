import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "@ezmails/db";
import { encryptSecret, decryptSecret, recoveryCode, sha256hex } from "../lib/crypto.js";

const ISSUER = "Infinit Email";

/**
 * AUTH-002/003: begin TOTP enrollment. Generates a secret (encrypted at rest),
 * a provisioning QR code, and one-time backup recovery codes.
 * The secret is not marked enabled until the user verifies a code.
 */
export async function setupTotp(user: { id: string; email: string }) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.email, ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  // Stash the encrypted (not-yet-enabled) secret on the user record.
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptSecret(secret), totpEnabled: false },
  });

  // Generate + persist hashed recovery codes; return the plaintext set once.
  const codes = Array.from({ length: 10 }, () => recoveryCode());
  await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });
  await prisma.recoveryCode.createMany({
    data: codes.map((c) => ({ userId: user.id, codeHash: sha256hex(c) })),
  });

  return { otpauth, qrDataUrl, recoveryCodes: codes };
}

/** Verify a TOTP code against the user's stored secret. */
export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  return authenticator.verify({ token: code, secret: decryptSecret(encryptedSecret) });
}

/** Mark TOTP enabled once the first code verifies. */
export async function enableTotp(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
}

/** Consume a backup recovery code (single use). Returns true if valid. */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const match = await prisma.recoveryCode.findFirst({
    where: { userId, codeHash: sha256hex(code.trim().toUpperCase()), usedAt: null },
  });
  if (!match) return false;
  await prisma.recoveryCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
  return true;
}
