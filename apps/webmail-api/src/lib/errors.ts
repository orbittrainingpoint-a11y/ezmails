import type { FastifyReply, FastifyRequest, FastifyError } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const Errors = {
  unauthorized: (m = "Authentication required.") => new AppError(401, "UNAUTHORIZED", m),
  invalidCredentials: () => new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."),
  notFound: (m = "Not found.") => new AppError(404, "NOT_FOUND", m),
  badRequest: (m: string) => new AppError(400, "BAD_REQUEST", m),
  upstream: (m = "Mail server error.") => new AppError(502, "MAIL_UPSTREAM", m),
};

export function errorHandler(error: FastifyError | AppError, _req: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ success: false, error: { code: error.code, message: error.message, details: error.details } });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({ success: false, error: { code: "VALIDATION_ERROR", message: "Validation failed.", details: error.flatten().fieldErrors } });
  }
  // Pass through Fastify's own 4xx errors (e.g. unsupported media type) instead of masking them as 500.
  const fe = error as FastifyError;
  if (typeof fe.statusCode === "number" && fe.statusCode >= 400 && fe.statusCode < 500) {
    return reply.status(fe.statusCode).send({ success: false, error: { code: fe.code ?? "BAD_REQUEST", message: fe.message } });
  }
  reply.log.error(error);
  return reply.status(500).send({ success: false, error: { code: "INTERNAL_ERROR", message: "Unexpected error." } });
}
