import type { FastifyRequest } from "fastify";
import type { UserRole } from "@ezmails/db";
import { Errors } from "../lib/errors.js";

/**
 * RBAC-001/002/006: returns a preHandler that requires one of the given roles.
 * Use after `authenticate`, e.g. preHandler: [app.authenticate, requireRole("super_admin")].
 */
export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw Errors.unauthorized();
    if (!roles.includes(req.user.role)) throw Errors.forbidden();
  };
}
