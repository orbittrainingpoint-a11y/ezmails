import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitDomain, getHosts, setHosts, looksLikeNamecheap, NamecheapApiError } from "./namecheap.js";

const creds = { apiUser: "u", apiKey: "k", username: "u", clientIp: "1.2.3.4" };

describe("splitDomain", () => {
  it("splits a plain .com domain", () => {
    expect(splitDomain("assessexpert.com")).toEqual({ sld: "assessexpert", tld: "com" });
  });

  it("handles known two-label TLDs", () => {
    expect(splitDomain("example.co.uk")).toEqual({ sld: "example", tld: "co.uk" });
  });

  it("falls back to a single-label TLD for unknown suffixes", () => {
    expect(splitDomain("example.io")).toEqual({ sld: "example", tld: "io" });
  });
});

describe("looksLikeNamecheap", () => {
  it("recognises registrar-servers.com nameservers", () => {
    expect(looksLikeNamecheap(["dns1.registrar-servers.com.", "dns2.registrar-servers.com."])).toBe(true);
  });
  it("returns false for unrelated nameservers", () => {
    expect(looksLikeNamecheap(["ns1.cloudflare.com.", "ns2.cloudflare.com."])).toBe(false);
  });
});

describe("getHosts / setHosts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("parses a getHosts response into a host list", async () => {
    const xml = `<?xml version="1.0"?>
      <ApiResponse Status="OK">
        <Errors />
        <CommandResponse Type="namecheap.domains.dns.getHosts">
          <DomainDNSGetHostsResult Domain="example.com">
            <host HostId="12" Name="@" Type="A" Address="88.222.215.20" TTL="1800" />
            <host HostId="14" Name="@" Type="TXT" Address="v=spf1 include:spf.efwd.registrar-servers.com ~all" TTL="1800" />
          </DomainDNSGetHostsResult>
        </CommandResponse>
      </ApiResponse>`;
    vi.mocked(fetch).mockResolvedValueOnce(new Response(xml, { status: 200 }));

    const hosts = await getHosts(creds, "example.com");
    expect(hosts).toHaveLength(2);
    expect(hosts[0]).toMatchObject({ name: "@", type: "A", address: "88.222.215.20" });
    expect(hosts[1]).toMatchObject({ name: "@", type: "TXT" });
  });

  it("throws NamecheapApiError with the API's error message on failure", async () => {
    const xml = `<?xml version="1.0"?>
      <ApiResponse Status="ERROR">
        <Errors><Error Number="1011150">Invalid request IP</Error></Errors>
      </ApiResponse>`;
    vi.mocked(fetch).mockImplementation(async () => new Response(xml, { status: 200 }));

    await expect(getHosts(creds, "example.com")).rejects.toThrow(NamecheapApiError);
    await expect(getHosts(creds, "example.com")).rejects.toThrow(/Invalid request IP/);
  });

  it("posts the full merged host list on setHosts", async () => {
    const okXml = `<?xml version="1.0"?><ApiResponse Status="OK"><Errors /></ApiResponse>`;
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(new Response(okXml, { status: 200 }));

    await setHosts(creds, "example.com", [
      { name: "@", type: "MX", address: "mail.example.com", mxPref: 10, ttl: 1800 },
      { name: "www", type: "A", address: "88.222.215.20", ttl: 1800 },
    ]);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = new URLSearchParams(init!.body as string);
    expect(body.get("HostName1")).toBe("@");
    expect(body.get("RecordType1")).toBe("MX");
    expect(body.get("HostName2")).toBe("www");
    expect(body.get("Command")).toBe("namecheap.domains.dns.setHosts");
  });
});
