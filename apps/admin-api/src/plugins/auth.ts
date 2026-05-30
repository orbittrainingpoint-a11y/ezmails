import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@ezmails/db";
import { verifyAccessToken, type AccessClaims } from "../lib/jwt.js";
import { sha256hex } from "../lib/crypto.js";
import { Errors } from "../lib/errors.js";

export interface AuthUser {
  id: string;
  role: AccessClaims["role"];
  viaApiToken?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/** Resolve an opaque API token (API-001/002) to its owning user, if valid. */
async function resolveApiToken(raw: string): Promise<AuthUser | null> {
  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: sha256hex(raw) },
    include: { user: true },
  });
  if (!token || token.revokedAt) return null;
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return null;
  if (!token.user.isActive) return null;

  // Best-effort last-used stamp (don't block the request on it).
  void prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { id: token.user.id, role: token.user.role, viaApiToken: true };
}

/**
 * Decorates the instance with `authenticate`, a preHandler that accepts either a
 * JWT access token or a personal API token in the Bearer header, and attaches
 * `req.user`. RBAC-006: role checks happen server-side after this.
 */
export default fp(async (app) => {
  app.decorate("authenticate", async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw Errors.unauthorized();
    const token = header.slice("Bearer ".length).trim();

    // Try JWT first; fall back to API token lookup.
    try {
      const claims = await verifyAccessToken(token);
      req.user = { id: claims.sub, role: claims.role };
      return;
    } catch {
      const apiUser = await resolveApiToken(token);
      if (!apiUser) throw Errors.invalidToken("Access token is invalid or expired.");
      req.user = apiUser;
    }
  });
});
