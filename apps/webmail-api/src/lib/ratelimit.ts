import { redis } from "./redis.js";

/**
 * Fixed-window rate limit. Increments a counter under `key`; the first hit sets
 * the window TTL. Returns ok=false once `max` is exceeded within `windowSec`.
 */
export async function hitLimit(key: string, max: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const k = `rl:${key}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSec);
  if (n > max) {
    const ttl = await redis.ttl(k);
    return { ok: false, retryAfter: ttl > 0 ? ttl : windowSec };
  }
  return { ok: true, retryAfter: 0 };
}

// ── Failed-login lockout (per account) ──
const failKey = (id: string) => `fail:${id}`;

export async function isLockedOut(id: string, max: number): Promise<{ locked: boolean; retryAfter: number }> {
  const n = Number(await redis.get(failKey(id))) || 0;
  if (n >= max) {
    const ttl = await redis.ttl(failKey(id));
    return { locked: true, retryAfter: ttl > 0 ? ttl : 0 };
  }
  return { locked: false, retryAfter: 0 };
}

export async function recordFailure(id: string, lockSec: number): Promise<void> {
  const n = await redis.incr(failKey(id));
  if (n === 1) await redis.expire(failKey(id), lockSec);
}

export async function clearFailures(id: string): Promise<void> {
  await redis.del(failKey(id));
}
