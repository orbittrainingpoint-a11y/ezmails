import { ImapFlow } from "imapflow";
import { env } from "../config/env.js";
import type { WebmailCreds } from "./session.js";

/** Open an authenticated IMAP connection for the given mailbox credentials. */
export async function openImap(creds: { email: string; password: string }): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: env.IMAP_PORT === 993,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
    tls: { rejectUnauthorized: env.MAIL_TLS_REJECT_UNAUTHORIZED },
  });
  await client.connect();
  return client;
}

/** Run a function with a connected client, always logging out afterward. */
export async function withImap<T>(creds: WebmailCreds, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = await openImap(creds);
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Verify credentials by attempting an IMAP login. */
export async function verifyImapLogin(email: string, password: string): Promise<boolean> {
  try {
    const client = await openImap({ email, password });
    await client.logout().catch(() => client.close());
    return true;
  } catch {
    return false;
  }
}
