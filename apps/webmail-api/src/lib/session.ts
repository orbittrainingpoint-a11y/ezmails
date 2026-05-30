import { redis } from "./redis.js";
import { encrypt, decrypt, sha256, randomToken } from "./crypto.js";
import { env } from "../config/env.js";

export interface WebmailCreds {
  mailboxId: string;
  email: string;
  password: string; // decrypted in memory only
}

const key = (tokenHash: string) => `webmail:sess:${tokenHash}`;

/** Create a server-side session; the raw token is returned once to the client. */
export async function createSession(mailboxId: string, email: string, password: string): Promise<string> {
  const token = randomToken(32);
  const payload = JSON.stringify({ mailboxId, email, p: encrypt(password) });
  await redis.set(key(sha256(token)), payload, "EX", env.WEBMAIL_SESSION_TTL_HOURS * 3600);
  return token;
}

export async function resolveSession(token: string): Promise<WebmailCreds | null> {
  const raw = await redis.get(key(sha256(token)));
  if (!raw) return null;
  const { mailboxId, email, p } = JSON.parse(raw) as { mailboxId: string; email: string; p: string };
  return { mailboxId, email, password: decrypt(p) };
}

export async function destroySession(token: string): Promise<void> {
  await redis.del(key(sha256(token)));
}
