// DNS-over-HTTPS resolver used for live record validation (no local resolver
// dependency, works inside containers). Queries Cloudflare's JSON DoH endpoint.

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

const DOH_URL = "https://cloudflare-dns.com/dns-query";

/** Resolve a name/type via DoH. Returns the raw answer data strings. */
export async function resolveDns(name: string, type: "MX" | "TXT" | "A" | "CNAME"): Promise<string[]> {
  const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) throw new Error(`DoH query failed: ${res.status}`);
  const json = (await res.json()) as { Answer?: DohAnswer[] };
  return (json.Answer ?? []).map((a) => a.data);
}

/** Strip surrounding quotes and join multi-string TXT chunks, normalise whitespace. */
export function normaliseTxt(value: string): string {
  return value
    .replace(/"\s*"/g, "") // joined TXT chunks: "abc" "def" → "abcdef"
    .replace(/^"|"$/g, "")
    .trim();
}

/** Drop a trailing dot from FQDNs returned by DNS. */
export function stripTrailingDot(value: string): string {
  return value.replace(/\.$/, "");
}
