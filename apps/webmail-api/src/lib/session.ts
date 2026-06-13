import { redis } from "./redis.js";
import { encrypt, decrypt, sha256, randomToken } from "./crypto.js";
import { env } from "../config/env.js";

export interface WebmailCreds {
  mailboxId: string;
  email: string;
  password: string; // decrypted in memory only
}

interface SessionPayload {
  mailboxId: string;
  email: string;
  p: string; // encrypted password
  ip?: string;
  ua?: string;
  createdAt: string;
  lastSeenAt: string;
}

const key = (tokenHash: string) => `webmail:sess:${tokenHash}`;
const idxKey = (mailboxId: string) => `webmail:sessidx:${mailboxId}`;
const ttlSec = () => env.WEBMAIL_SESSION_TTL_HOURS * 3600;

export const hashToken = (token: string) => sha256(token);

/** Create a server-side session with device metadata, indexed per mailbox. */
export async function createSession(
  mailboxId: string,
  email: string,
  password: string,
  meta: { ip?: string; ua?: string } = {},
): Promise<string> {
  const token = randomToken(32);
  const h = sha256(token);
  const now = new Date().toISOString();
  const payload: SessionPayload = { mailboxId, email, p: encrypt(password), ip: meta.ip, ua: meta.ua?.slice(0, 400), createdAt: now, lastSeenAt: now };
  await redis.set(key(h), JSON.stringify(payload), "EX", ttlSec());
  await redis.sadd(idxKey(mailboxId), h);
  await redis.expire(idxKey(mailboxId), ttlSec() + 3600);
  return token;
}

export async function resolveSession(token: string): Promise<WebmailCreds | null> {
  const h = sha256(token);
  const raw = await redis.get(key(h));
  if (!raw) return null;
  const s = JSON.parse(raw) as SessionPayload;
  // Refresh "last seen" at most every 5 minutes (cheap activity tracking).
  const last = Date.parse(s.lastSeenAt) || 0;
  if (Date.now() - last > 300_000) {
    s.lastSeenAt = new Date().toISOString();
    const ttl = await redis.ttl(key(h));
    await redis.set(key(h), JSON.stringify(s), "EX", ttl > 0 ? ttl : ttlSec());
  }
  return { mailboxId: s.mailboxId, email: s.email, password: decrypt(s.p) };
}

export async function destroySession(token: string): Promise<void> {
  const h = sha256(token);
  const raw = await redis.get(key(h));
  if (raw) {
    const s = JSON.parse(raw) as SessionPayload;
    await redis.srem(idxKey(s.mailboxId), h);
  }
  await redis.del(key(h));
}

export interface SessionInfo {
  id: string;
  ip: string | null;
  ua: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** List a mailbox's active sessions, pruning any that have expired. */
export async function listSessions(mailboxId: string, currentHash: string): Promise<SessionInfo[]> {
  const hashes = await redis.smembers(idxKey(mailboxId));
  const out: SessionInfo[] = [];
  for (const h of hashes) {
    const raw = await redis.get(key(h));
    if (!raw) { await redis.srem(idxKey(mailboxId), h); continue; }
    const s = JSON.parse(raw) as SessionPayload;
    out.push({ id: h, ip: s.ip ?? null, ua: s.ua ?? null, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: h === currentHash });
  }
  return out.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/** Revoke one session (only if it belongs to this mailbox). */
export async function revokeSession(mailboxId: string, id: string): Promise<{ revoked: number }> {
  if (!(await redis.sismember(idxKey(mailboxId), id))) return { revoked: 0 };
  await redis.del(key(id));
  await redis.srem(idxKey(mailboxId), id);
  return { revoked: 1 };
}

/** Sign out everywhere except the current session. */
export async function revokeOtherSessions(mailboxId: string, currentHash: string): Promise<{ revoked: number }> {
  const hashes = await redis.smembers(idxKey(mailboxId));
  let n = 0;
  for (const h of hashes) {
    if (h === currentHash) continue;
    await redis.del(key(h));
    await redis.srem(idxKey(mailboxId), h);
    n++;
  }
  return { revoked: n };
}
