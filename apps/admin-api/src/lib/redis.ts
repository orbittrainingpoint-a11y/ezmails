import { Redis } from "ioredis";
import { env } from "../config/env.js";

// Shared Redis connection for rate limiting, password-reset tokens, and cache.
// BullMQ (Phase 4) will use its own connection with maxRetriesPerRequest: null.
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[redis] connection error:", err.message);
});
