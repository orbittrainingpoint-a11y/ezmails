import { lookup } from "node:dns/promises";
import net from "node:net";

/** True for loopback / private / link-local / reserved IP ranges (v4 + v6). */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) || // CGNAT 100.64/10
      (a === 169 && b === 254) ||             // link-local
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224                                 // multicast / reserved
    );
  }
  const lc = ip.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    lc === "::1" || lc === "::" ||
    lc.startsWith("fc") || lc.startsWith("fd") || // unique-local
    lc.startsWith("fe80") ||                       // link-local
    lc.startsWith("::ffff:")                        // IPv4-mapped (re-check separately if needed)
  );
}

const BLOCKED_NAMES = /^(localhost|postfix|dovecot|redis|postgres|admin-api|webmail-api|rspamd|clamav|metadata)(\.|$)/i;

/**
 * Reject hostnames that resolve to internal/loopback addresses (SSRF guard for
 * user-supplied connection targets like the IMAP-import source).
 */
export async function assertPublicHost(host: string): Promise<void> {
  const h = host.trim();
  if (!h || BLOCKED_NAMES.test(h)) throw new Error("That host is not allowed.");
  if (net.isIP(h)) {
    if (isPrivateIp(h)) throw new Error("Connecting to private/internal addresses is not allowed.");
    return;
  }
  const results = await lookup(h, { all: true }).catch(() => [] as { address: string }[]);
  if (results.length === 0) throw new Error("Could not resolve that host.");
  for (const r of results) {
    if (isPrivateIp(r.address)) throw new Error("That host resolves to a private/internal address and is not allowed.");
  }
}
