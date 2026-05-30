import { prisma } from "@ezmails/db";
import { randomToken, sha256hex } from "../lib/crypto.js";
import { env } from "../config/env.js";

const REMEMBER_DAYS = 30;

export interface IssuedRefresh {
  token: string; // raw — returned to client once
  expiresAt: Date;
}

/**
 * Create a refresh session. The raw token is returned to the caller exactly once;
 * only its SHA-256 hash is persisted (TRD §8.1).
 */
export async function createSession(input: {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  rememberMe?: boolean;
}): Promise<IssuedRefresh> {
  const token = randomToken(32);
  const ttlMs = input.rememberMe
    ? REMEMBER_DAYS * 24 * 60 * 60 * 1000
    : env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: sha256hex(token),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      rememberMe: input.rememberMe ?? false,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/** Resolve a raw refresh token to its (valid, unexpired) session + user. */
export async function resolveSession(rawToken: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256hex(rawToken) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session;
}

export async function revokeSession(rawToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: sha256hex(rawToken) } });
}

/** AUTH-008: admin force-logout of all sessions for a user. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

export async function listSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, ipAddress: true, userAgent: true, rememberMe: true, createdAt: true, expiresAt: true },
  });
}
