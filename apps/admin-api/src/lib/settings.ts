import { prisma } from "@ezmails/db";
import { env } from "../config/env.js";
import { encryptSecret, decryptSecret } from "./crypto.js";

/** Typed accessors for the generic Setting key/value store. */
export const SettingKeys = {
  spamThresholds: "spam.thresholds",
  queueAlertDepth: "queue.alert_depth",
  registrarNamecheap: "registrar.namecheap",
} as const;

export interface SpamThresholds {
  tag: number;
  greylist: number;
  reject: number;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}

export async function getSpamThresholds(): Promise<SpamThresholds> {
  return getSetting<SpamThresholds>(SettingKeys.spamThresholds, {
    tag: env.RSPAMD_TAG_SCORE ?? 6,
    greylist: env.RSPAMD_GREYLIST_SCORE ?? 9,
    reject: env.RSPAMD_REJECT_SCORE ?? 15,
  });
}

export interface NamecheapCredentialsStored {
  apiUser: string;
  apiKeyEncrypted: string;
  username: string;
  clientIp: string;
}

/** Decrypted, ready-to-use Namecheap API credentials, or null if not configured. */
export async function getNamecheapCredentials(): Promise<{ apiUser: string; apiKey: string; username: string; clientIp: string } | null> {
  const stored = await getSetting<NamecheapCredentialsStored | null>(SettingKeys.registrarNamecheap, null);
  if (!stored) return null;
  return {
    apiUser: stored.apiUser,
    apiKey: decryptSecret(stored.apiKeyEncrypted),
    username: stored.username,
    clientIp: stored.clientIp,
  };
}

export async function setNamecheapCredentials(input: {
  apiUser: string;
  apiKey: string;
  username: string;
  clientIp: string;
}): Promise<void> {
  await setSetting<NamecheapCredentialsStored>(SettingKeys.registrarNamecheap, {
    apiUser: input.apiUser,
    apiKeyEncrypted: encryptSecret(input.apiKey),
    username: input.username,
    clientIp: input.clientIp,
  });
}
