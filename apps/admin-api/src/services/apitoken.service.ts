import { prisma } from "@ezmails/db";
import { Errors } from "../lib/errors.js";
import { randomToken, sha256hex } from "../lib/crypto.js";

const PREFIX = "ezmails_";

/** API-005: list a user's API tokens (never returns the secret). */
export async function listTokens(userId: string) {
  return prisma.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true },
  });
}

/** Generate a token. The raw secret is returned exactly once. */
export async function createToken(userId: string, name: string, expiresAt?: Date) {
  const raw = `${PREFIX}${randomToken(32)}`;
  const token = await prisma.apiToken.create({
    data: { userId, name, tokenHash: sha256hex(raw), expiresAt },
    select: { id: true, name: true, expiresAt: true, createdAt: true },
  });
  return { ...token, token: raw };
}

export async function revokeToken(userId: string, id: string) {
  const token = await prisma.apiToken.findFirst({ where: { id, userId } });
  if (!token) throw Errors.notFound("Token not found.");
  await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
}
