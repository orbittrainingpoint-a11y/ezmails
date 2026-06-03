import bcrypt from "bcryptjs";
import { prisma, type User } from "@ezmails/db";
import { redis } from "../lib/redis.js";
import { env } from "../config/env.js";
import { Errors } from "../lib/errors.js";
import { randomToken, sha256hex } from "../lib/crypto.js";
import { slidingWindow, resetWindow } from "../lib/rate-limit.js";
import { sendSystemMail } from "../lib/mailer.js";

// AUTH-001: 5 failed attempts → 15-minute lockout, tracked per account.
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SEC = 15 * 60;
const MFA_PENDING_TTL_SEC = 5 * 60;
const RESET_TTL_SEC = 60 * 60; // AUTH-009: 1-hour expiry

const lockKey = (email: string) => `login:attempts:${email.toLowerCase()}`;
const mfaKey = (token: string) => `mfa:pending:${token}`;
const resetKey = (hash: string) => `pwreset:${hash}`;

/** Verify credentials, enforcing per-account lockout. Returns the user on success. */
export async function verifyCredentials(email: string, password: string): Promise<User> {
  const lock = lockKey(email);
  const attempts = Number((await redis.get(lock)) ?? 0);
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    const ttl = await redis.ttl(lock);
    throw Errors.accountLocked(ttl > 0 ? ttl : LOCKOUT_WINDOW_SEC);
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always run bcrypt to keep timing constant whether or not the user exists.
  const hash = user?.passwordHash ?? "$2a$12$0000000000000000000000000000000000000000000000000000";
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok || !user.isActive) {
    const { count } = await slidingWindow(lock, MAX_LOGIN_ATTEMPTS, LOCKOUT_WINDOW_SEC);
    if (count >= MAX_LOGIN_ATTEMPTS) {
      const ttl = await redis.ttl(lock);
      throw Errors.accountLocked(ttl > 0 ? ttl : LOCKOUT_WINDOW_SEC);
    }
    throw Errors.invalidCredentials();
  }

  await resetWindow(lock);
  return user;
}

/** Issue a short-lived MFA-pending token (held in Redis) for the 2FA step. */
export async function startMfaChallenge(userId: string): Promise<string> {
  const token = randomToken(24);
  await redis.set(mfaKey(token), userId, "EX", MFA_PENDING_TTL_SEC);
  return token;
}

export async function consumeMfaChallenge(token: string): Promise<string | null> {
  const userId = await redis.get(mfaKey(token));
  if (userId) await redis.del(mfaKey(token));
  return userId;
}

/** Hash a new application password with bcrypt at the configured cost. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_COST);
}

/**
 * AUTH-009: issue a password-reset link. Always resolves successfully to avoid
 * leaking which emails are registered.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return;

  const raw = randomToken(32);
  await redis.set(resetKey(sha256hex(raw)), user.id, "EX", RESET_TTL_SEC);

  const link = `${env.ADMIN_PANEL_URL}/reset-password?token=${raw}`;
  await sendSystemMail({
    to: user.email,
    subject: "Reset your Infinit Email password",
    text: `Use this link within 1 hour to reset your password:\n\n${link}\n\nIf you didn't request this, ignore this email.`,
    html: `<p>Use this link within 1 hour to reset your password:</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, ignore this email.</p>`,
  }).catch(() => {
    /* swallow — never reveal mail delivery state to the requester */
  });
}

/** Complete a password reset; invalidates all existing sessions. */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const key = resetKey(sha256hex(rawToken));
  const userId = await redis.get(key);
  if (!userId) throw Errors.invalidToken("Reset link is invalid or has expired.");
  await redis.del(key);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.session.deleteMany({ where: { userId } });
}
