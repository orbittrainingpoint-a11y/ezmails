import { generateKeyPairSync } from "node:crypto";

export interface DkimKeyMaterial {
  privateKeyPem: string; // PKCS#8 PEM — stored encrypted
  publicKeyPem: string; // SPKI PEM
  dnsValue: string; // ready-to-publish TXT record value
}

/**
 * DKIM-001: generate a 2048-bit RSA key pair and the DNS TXT value Rspamd expects.
 * The DNS value is `v=DKIM1; k=rsa; p=<base64 DER of the SPKI public key>`.
 */
export function generateDkimKey(): DkimKeyMaterial {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const p = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");

  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    dnsValue: `v=DKIM1; k=rsa; p=${p}`,
  };
}

/** Build a date-based selector for rotation, e.g. "ezmails-20260530". */
export function makeSelector(base: string): string {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
  return `${base}-${stamp}`;
}
