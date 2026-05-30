import type { FastifyReply, FastifyRequest, FastifyError } from "fastify";
import { ZodError } from "zod";

/**
 * Application error carrying a stable machine code + HTTP status, matching the
 * TRD §5.5 error envelope: { success:false, error:{ code, message, details } }.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: (msg = "Authentication required.") => new AppError(401, "UNAUTHORIZED", msg),
  forbidden: (msg = "You do not have permission to perform this action.") =>
    new AppError(403, "FORBIDDEN", msg),
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."),
  accountLocked: (retryAfterSec: number) =>
    new AppError(429, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later.", {
      retryAfterSec,
    }),
  rateLimited: () => new AppError(429, "RATE_LIMITED", "Too many requests. Slow down."),
  mfaRequired: () => new AppError(401, "MFA_REQUIRED", "Two-factor authentication required."),
  invalidToken: (msg = "Token is invalid or expired.") => new AppError(401, "INVALID_TOKEN", msg),
  notFound: (msg = "Resource not found.") => new AppError(404, "NOT_FOUND", msg),
  conflict: (msg: string) => new AppError(409, "CONFLICT", msg),
};

/** Central Fastify error handler — converts everything to the standard envelope. */
export function errorHandler(error: FastifyError | AppError, _req: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.flatten().fieldErrors,
      },
    });
  }
  // Fastify's own validation (schema) errors
  if ((error as FastifyError).validation) {
    return reply.status(400).send({
      success: false,
      error: { code: "VALIDATION_ERROR", message: error.message },
    });
  }
  // Pass through Fastify's own 4xx errors instead of masking them as 500.
  const fe = error as FastifyError;
  if (typeof fe.statusCode === "number" && fe.statusCode >= 400 && fe.statusCode < 500) {
    return reply.status(fe.statusCode).send({ success: false, error: { code: fe.code ?? "BAD_REQUEST", message: fe.message } });
  }

  reply.log.error(error);
  return reply.status(500).send({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
}
