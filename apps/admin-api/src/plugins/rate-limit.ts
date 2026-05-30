import type { FastifyRequest } from "fastify";
import { slidingWindow } from "../lib/rate-limit.js";
import { Errors } from "../lib/errors.js";

/**
 * Per-IP request limiter for sensitive endpoints (TRD §8.4: auth = 10 req/min/IP).
 * Returns a preHandler closure scoped by a name so different routes don't collide.
 */
export function ipRateLimit(name: string, limit = 10, windowSec = 60) {
  return async (req: FastifyRequest) => {
    const ip = req.ip || "unknown";
    const { exceeded } = await slidingWindow(`rl:${name}:${ip}`, limit, windowSec);
    if (exceeded) throw Errors.rateLimited();
  };
}
