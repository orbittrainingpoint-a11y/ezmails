import { redis } from "./redis.js";

/**
 * Redis sliding-window counter. Increments the key and sets its TTL on first hit.
 * Returns the current count and whether the limit is exceeded.
 */
export async function slidingWindow(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ count: number; exceeded: boolean; ttl: number }> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }
  const ttl = await redis.ttl(key);
  return { count, exceeded: count > limit, ttl: ttl < 0 ? windowSec : ttl };
}

export async function resetWindow(key: string): Promise<void> {
  await redis.del(key);
}
