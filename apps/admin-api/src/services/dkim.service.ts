import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@ezmails/db";
import { env } from "../config/env.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { generateDkimKey, makeSelector } from "../lib/dkim.js";

/**
 * Write the DKIM private key to the Rspamd key directory and record the active
 * selector in selectors.map (one "domain selector" line per domain) so Rspamd's
 * dkim_signing module signs with the current key. Best-effort: failures are
 * non-fatal so the API still works without the mounted volume (e.g. local dev).
 */
async function syncKeyToDisk(domainName: string, selector: string, privateKeyPem: string) {
  try {
    await mkdir(env.DKIM_KEY_PATH, { recursive: true });
    await writeFile(join(env.DKIM_KEY_PATH, `${domainName}.${selector}.key`), privateKeyPem, {
      mode: 0o640,
    });
    await upsertSelectorMap(domainName, selector);
  } catch {
    /* ignore — Rspamd may not be present in dev */
  }
}

/** Maintain Rspamd's selectors.map: set/replace the line for this domain. */
async function upsertSelectorMap(domainName: string, selector: string) {
  const mapPath = join(env.DKIM_KEY_PATH, "selectors.map");
  let lines: string[] = [];
  try {
    lines = (await readFile(mapPath, "utf8")).split("\n").filter(Boolean);
  } catch {
    /* file may not exist yet */
  }
  const filtered = lines.filter((l) => l.split(/\s+/)[0] !== domainName);
  filtered.push(`${domainName} ${selector}`);
  await writeFile(mapPath, filtered.join("\n") + "\n", { mode: 0o640 });
}

/** Create the initial DKIM key for a domain (called during domain creation). */
export async function createInitialDkim(domainId: string, domainName: string) {
  const selector = makeSelector(env.DKIM_SELECTOR);
  const material = generateDkimKey();

  await prisma.dkimKey.create({
    data: {
      domainId,
      selector,
      privateKey: encryptSecret(material.privateKeyPem),
      publicKey: material.publicKeyPem,
      isActive: true,
    },
  });
  await syncKeyToDisk(domainName, selector, material.privateKeyPem);

  return { selector, dnsValue: material.dnsValue };
}

/** DKIM-004: list keys for a domain with their publishable DNS values. */
export async function listDkimKeys(domainId: string) {
  const keys = await prisma.dkimKey.findMany({
    where: { domainId },
    orderBy: { createdAt: "desc" },
  });
  return keys.map((k) => ({
    id: k.id,
    selector: k.selector,
    isActive: k.isActive,
    createdAt: k.createdAt,
    dnsHostname: `${k.selector}._domainkey`,
    dnsValue: publicKeyToDns(k.publicKey),
  }));
}

/**
 * DKIM-002: rotate the key. A new selector/key becomes active while the old key
 * stays active during a grace period so in-flight mail keeps verifying.
 */
export async function rotateDkim(domainId: string, domainName: string) {
  const selector = makeSelector(env.DKIM_SELECTOR);
  const material = generateDkimKey();

  const created = await prisma.dkimKey.create({
    data: {
      domainId,
      selector,
      privateKey: encryptSecret(material.privateKeyPem),
      publicKey: material.publicKeyPem,
      isActive: true,
    },
  });
  await syncKeyToDisk(domainName, selector, material.privateKeyPem);

  // Add a DNS record for the new selector so the admin can publish it.
  await prisma.dnsRecord.create({
    data: {
      domainId,
      recordType: "DKIM",
      hostname: `${selector}._domainkey.${domainName}`,
      expectedValue: material.dnsValue,
      status: "unchecked",
    },
  });

  return { id: created.id, selector, dnsHostname: `${selector}._domainkey`, dnsValue: material.dnsValue };
}

/** DKIM-003: export a key's public value in DNS TXT format. */
export function publicKeyToDns(publicKeyPem: string): string {
  const p = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  return `v=DKIM1; k=rsa; p=${p}`;
}

/** Decrypt a stored private key (used by mail-stack sync in Phase 12). */
export function decryptPrivateKey(stored: string): string {
  return decryptSecret(stored);
}
