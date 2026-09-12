import { XMLParser } from "fast-xml-parser";

/**
 * DOM-021: thin client for Namecheap's `domains.dns.getHosts`/`setHosts` XML
 * API. `setHosts` replaces a domain's ENTIRE host record list in one call —
 * every caller here must fetch first, merge, then set the full merged list.
 * Never call `setHosts` with a partial list.
 */

export interface NamecheapCredentials {
  apiUser: string;
  apiKey: string;
  username: string;
  /** The public IP Namecheap has whitelisted for this account's API access. */
  clientIp: string;
}

export interface NamecheapHost {
  hostId?: string;
  name: string; // "@" for apex, or subdomain label
  type: "A" | "AAAA" | "CNAME" | "MX" | "MXE" | "TXT" | "URL" | "URL301" | "FRAME" | "NS";
  address: string;
  mxPref?: number;
  ttl?: number;
}

const API_URL = "https://api.namecheap.com/xml.response";

// Common two-label public suffixes. Namecheap's API wants SLD/TLD split
// exactly, and there's no full public-suffix-list dependency here — this
// covers the common cases; anything else falls back to a single-label TLD
// (correct for the overwhelming majority of real-world domains, e.g. .com).
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "me.uk", "ac.uk",
  "co.in", "co.nz", "co.za", "com.au", "net.au", "org.au",
]);

export function splitDomain(domainName: string): { sld: string; tld: string } {
  const labels = domainName.toLowerCase().split(".");
  const lastTwo = labels.slice(-2).join(".");
  if (labels.length > 2 && MULTI_PART_TLDS.has(lastTwo)) {
    return { sld: labels.slice(0, -2).join("."), tld: lastTwo };
  }
  return { sld: labels.slice(0, -1).join("."), tld: labels[labels.length - 1]! };
}

function baseParams(creds: NamecheapCredentials, command: string): URLSearchParams {
  return new URLSearchParams({
    ApiUser: creds.apiUser,
    ApiKey: creds.apiKey,
    UserName: creds.username,
    ClientIp: creds.clientIp,
    Command: command,
  });
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export class NamecheapApiError extends Error {
  constructor(message: string, public readonly numbers?: string) {
    super(message);
    this.name = "NamecheapApiError";
  }
}

function assertOk(parsed: Record<string, unknown>): Record<string, unknown> {
  const root = parsed.ApiResponse as Record<string, unknown> | undefined;
  if (!root) throw new NamecheapApiError("Unexpected response from Namecheap API.");
  if (root["@_Status"] !== "OK") {
    const errors = root.Errors as { Error?: unknown } | undefined;
    const raw = errors?.Error;
    const toText = (e: unknown): string =>
      typeof e === "object" && e !== null && "#text" in e ? String((e as { "#text": unknown })["#text"]) : String(e);
    const messages = Array.isArray(raw) ? raw.map(toText) : raw ? [toText(raw)] : ["Unknown error"];
    throw new NamecheapApiError(messages.join("; "));
  }
  return root;
}

/** Fetch the full current host record list for a domain. */
export async function getHosts(creds: NamecheapCredentials, domainName: string): Promise<NamecheapHost[]> {
  const { sld, tld } = splitDomain(domainName);
  const params = baseParams(creds, "namecheap.domains.dns.getHosts");
  params.set("SLD", sld);
  params.set("TLD", tld);

  const res = await fetch(`${API_URL}?${params.toString()}`);
  const xml = await res.text();
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const root = assertOk(parsed);
  const commandResponse = root.CommandResponse as Record<string, unknown> | undefined;
  const result = commandResponse?.DomainDNSGetHostsResult as Record<string, unknown> | undefined;
  const rawHosts = result?.host;
  const list = Array.isArray(rawHosts) ? rawHosts : rawHosts ? [rawHosts] : [];

  return (list as Record<string, string>[]).map((h) => ({
    hostId: h["@_HostId"],
    name: h["@_Name"] ?? "",
    type: h["@_Type"] as NamecheapHost["type"],
    address: h["@_Address"] ?? "",
    mxPref: h["@_MXPref"] ? Number(h["@_MXPref"]) : undefined,
    ttl: h["@_TTL"] ? Number(h["@_TTL"]) : undefined,
  }));
}

/** Replace a domain's ENTIRE host record list. Callers must pass the full merged set. */
export async function setHosts(
  creds: NamecheapCredentials,
  domainName: string,
  hosts: NamecheapHost[],
): Promise<void> {
  const { sld, tld } = splitDomain(domainName);
  const params = baseParams(creds, "namecheap.domains.dns.setHosts");
  params.set("SLD", sld);
  params.set("TLD", tld);

  hosts.forEach((h, i) => {
    const n = i + 1;
    params.set(`HostName${n}`, h.name);
    params.set(`RecordType${n}`, h.type);
    params.set(`Address${n}`, h.address);
    if (h.mxPref !== undefined) params.set(`MXPref${n}`, String(h.mxPref));
    params.set(`TTL${n}`, String(h.ttl ?? 1800));
  });

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const xml = await res.text();
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  assertOk(parsed);
}

/** Best-effort registrar detection via NS records — always confirmed by the admin, never assumed silently. */
export function looksLikeNamecheap(nsAnswers: string[]): boolean {
  return nsAnswers.some((ns) => ns.toLowerCase().includes("registrar-servers.com"));
}

/** Verify the API credentials + IP whitelist work, without needing a specific domain. */
export async function testConnection(creds: NamecheapCredentials): Promise<void> {
  const params = baseParams(creds, "namecheap.domains.getList");
  params.set("Page", "1");
  params.set("PageSize", "10");
  const res = await fetch(`${API_URL}?${params.toString()}`);
  const xml = await res.text();
  assertOk(xmlParser.parse(xml) as Record<string, unknown>);
}
