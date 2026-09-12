import { prisma, type DnsRecordType } from "@ezmails/db";
import { Errors } from "../lib/errors.js";
import { getNamecheapCredentials } from "../lib/settings.js";
import { resolveDns } from "../lib/dns.js";
import { scheduleDnsRecheck } from "../lib/queue.js";
import { getHosts, setHosts, looksLikeNamecheap, type NamecheapHost } from "./registrars/namecheap.js";

export type SupportedRegistrar = "namecheap";

const SNAPSHOT_ACTION = "domain.dns.registrar_sync_snapshot";

/**
 * DOM-021: best-effort registrar detection via NS records. Always shown to
 * the admin for confirmation before anything is written — never assumed.
 */
export async function detectRegistrar(domainName: string): Promise<SupportedRegistrar | null> {
  try {
    const ns = await resolveDns(domainName, "NS");
    if (looksLikeNamecheap(ns)) return "namecheap";
  } catch {
    /* DNS lookup failed — just report "unknown", not an error */
  }
  return null;
}

/** Turn a `dns_records` row's hostname into the Namecheap-style name relative to the domain apex. */
function relativeName(hostname: string, domainName: string): string {
  if (hostname.toLowerCase() === domainName.toLowerCase()) return "@";
  const suffix = `.${domainName}`.toLowerCase();
  const lower = hostname.toLowerCase();
  return lower.endsWith(suffix) ? hostname.slice(0, hostname.length - suffix.length) : hostname;
}

interface ManagedRecord {
  recordType: DnsRecordType;
  name: string; // Namecheap-style relative name ("@" for apex)
  desired: NamecheapHost;
  /** How to recognise a pre-existing host as "this record" among possibly-multiple hosts at the same name. */
  matches: (h: NamecheapHost) => boolean;
}

function buildManagedRecords(
  domainName: string,
  dnsRecords: { recordType: DnsRecordType; hostname: string | null; expectedValue: string }[],
): ManagedRecord[] {
  return dnsRecords
    .map((r): ManagedRecord | null => {
      const hostname = r.hostname ?? domainName;
      const name = relativeName(hostname, domainName);
      if (r.recordType === "MX") {
        const [pref, ...hostParts] = r.expectedValue.split(/\s+/);
        return {
          recordType: r.recordType,
          name,
          desired: { name, type: "MX", address: hostParts.join(" "), mxPref: Number(pref) || 10, ttl: 1800 },
          matches: (h) => h.name === name && h.type === "MX",
        };
      }
      if (r.recordType === "SPF") {
        return {
          recordType: r.recordType,
          name,
          desired: { name, type: "TXT", address: r.expectedValue, ttl: 1800 },
          matches: (h) => h.name === name && h.type === "TXT" && h.address.toLowerCase().startsWith("v=spf1"),
        };
      }
      if (r.recordType === "DMARC") {
        return {
          recordType: r.recordType,
          name,
          desired: { name, type: "TXT", address: r.expectedValue, ttl: 1800 },
          matches: (h) => h.name === name && h.type === "TXT" && h.address.toLowerCase().startsWith("v=dmarc1"),
        };
      }
      if (r.recordType === "DKIM") {
        return {
          recordType: r.recordType,
          name,
          desired: { name, type: "TXT", address: r.expectedValue, ttl: 1800 },
          // DKIM selector names are dedicated (date-stamped) — an exact name match is unambiguous.
          matches: (h) => h.name === name && h.type === "TXT",
        };
      }
      return null; // A/PTR rows aren't registrar-managed here
    })
    .filter((r): r is ManagedRecord => r !== null);
}

export interface DnsSyncDiff {
  domainId: string;
  domainName: string;
  toAdd: NamecheapHost[];
  toUpdate: { before: NamecheapHost; after: NamecheapHost }[];
  unchanged: NamecheapHost[];
  preserved: NamecheapHost[];
  mergedHosts: NamecheapHost[];
}

async function loadDomainAndCreds(domainId: string) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId }, include: { dnsRecords: true } });
  if (!domain) throw Errors.notFound("Domain not found.");
  const creds = await getNamecheapCredentials();
  if (!creds) {
    throw Errors.badRequest(
      "No registrar connection configured. Add your Namecheap API credentials in Settings first.",
    );
  }
  return { domain, creds };
}

/**
 * Compute what would change at the registrar WITHOUT writing anything.
 * Every record type we manage is matched conservatively (see buildManagedRecords)
 * so unrelated existing records (www, other TXT entries, etc.) are always
 * left in `preserved`, untouched.
 */
export async function previewDnsSync(domainId: string): Promise<DnsSyncDiff> {
  const { domain, creds } = await loadDomainAndCreds(domainId);
  const existingHosts = await getHosts(creds, domain.domainName);
  const managed = buildManagedRecords(domain.domainName, domain.dnsRecords);

  const toAdd: NamecheapHost[] = [];
  const toUpdate: { before: NamecheapHost; after: NamecheapHost }[] = [];
  const unchanged: NamecheapHost[] = [];
  const claimed = new Set<NamecheapHost>();

  for (const rec of managed) {
    const existing = existingHosts.find((h) => !claimed.has(h) && rec.matches(h));
    if (!existing) {
      toAdd.push(rec.desired);
      continue;
    }
    claimed.add(existing);
    const same =
      existing.address.replace(/\s+/g, "") === rec.desired.address.replace(/\s+/g, "") &&
      (rec.desired.mxPref === undefined || existing.mxPref === rec.desired.mxPref);
    if (same) unchanged.push(existing);
    else toUpdate.push({ before: existing, after: { ...rec.desired, hostId: existing.hostId } });
  }

  const preserved = existingHosts.filter((h) => !claimed.has(h));
  const mergedHosts = [...preserved, ...unchanged, ...toUpdate.map((u) => u.after), ...toAdd];

  return { domainId, domainName: domain.domainName, toAdd, toUpdate, unchanged, preserved, mergedHosts };
}

/**
 * Apply a previously-previewed sync. Re-fetches current hosts immediately
 * before writing (fresh snapshot, not the possibly-stale preview) and stores
 * that snapshot in audit_log so `rollbackDnsSync` can restore it exactly.
 */
export async function applyDnsSync(
  domainId: string,
  diff: DnsSyncDiff,
  userId?: string,
): Promise<{ auditLogId: string }> {
  const { domain, creds } = await loadDomainAndCreds(domainId);
  const beforeHosts = await getHosts(creds, domain.domainName);

  const snapshot = await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action: SNAPSHOT_ACTION,
      resourceType: "domain",
      resourceId: domainId,
      metadata: { domainName: domain.domainName, hosts: beforeHosts as unknown as object },
    },
  });

  await setHosts(creds, domain.domainName, diff.mergedHosts);
  await scheduleDnsRecheck(domainId, 0);

  return { auditLogId: snapshot.id };
}

/** Restore the host list captured by `applyDnsSync`'s snapshot. */
export async function rollbackDnsSync(domainId: string, auditLogId: string): Promise<void> {
  const { domain, creds } = await loadDomainAndCreds(domainId);
  const snapshot = await prisma.auditLog.findUnique({ where: { id: auditLogId } });
  if (!snapshot || snapshot.action !== SNAPSHOT_ACTION || snapshot.resourceId !== domainId) {
    throw Errors.notFound("Snapshot not found for this domain.");
  }
  const meta = snapshot.metadata as { hosts?: NamecheapHost[] } | null;
  if (!meta?.hosts) throw Errors.badRequest("Snapshot has no host data to restore.");

  await setHosts(creds, domain.domainName, meta.hosts);
  await scheduleDnsRecheck(domainId, 0);
}
