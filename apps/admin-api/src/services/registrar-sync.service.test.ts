import { describe, it, expect, vi, beforeEach } from "vitest";

const { domainFindUnique, auditLogCreate, auditLogFindUnique, scheduleDnsRecheck, getNamecheapCredentials, getHosts, setHosts } =
  vi.hoisted(() => ({
    domainFindUnique: vi.fn(),
    auditLogCreate: vi.fn(),
    auditLogFindUnique: vi.fn(),
    scheduleDnsRecheck: vi.fn(),
    getNamecheapCredentials: vi.fn(),
    getHosts: vi.fn(),
    setHosts: vi.fn(),
  }));

vi.mock("@ezmails/db", () => ({
  prisma: {
    domain: { findUnique: domainFindUnique },
    auditLog: { create: auditLogCreate, findUnique: auditLogFindUnique },
  },
}));
vi.mock("../lib/queue.js", () => ({ scheduleDnsRecheck }));
vi.mock("../lib/settings.js", () => ({ getNamecheapCredentials }));
vi.mock("./registrars/namecheap.js", () => ({ getHosts, setHosts, looksLikeNamecheap: vi.fn() }));

import { previewDnsSync, applyDnsSync, rollbackDnsSync } from "./registrar-sync.service.js";

const creds = { apiUser: "u", apiKey: "k", username: "u", clientIp: "1.2.3.4" };

const domainWithRecords = (dnsRecords: { recordType: string; hostname: string | null; expectedValue: string }[]) => ({
  id: "d1",
  domainName: "assessexpert.com",
  dnsRecords,
});

describe("previewDnsSync", () => {
  beforeEach(() => {
    domainFindUnique.mockReset();
    getNamecheapCredentials.mockReset().mockResolvedValue(creds);
    getHosts.mockReset();
  });

  it("throws a clear error when no registrar credentials are configured", async () => {
    getNamecheapCredentials.mockResolvedValueOnce(null);
    domainFindUnique.mockResolvedValueOnce(domainWithRecords([]));
    await expect(previewDnsSync("d1")).rejects.toThrow(/registrar connection configured/);
  });

  it("adds every managed record when the registrar has no existing hosts", async () => {
    domainFindUnique.mockResolvedValueOnce(
      domainWithRecords([
        { recordType: "MX", hostname: "assessexpert.com", expectedValue: "10 infinit.email" },
        { recordType: "SPF", hostname: "assessexpert.com", expectedValue: "v=spf1 a:infinit.email mx ~all" },
        { recordType: "DMARC", hostname: "_dmarc.assessexpert.com", expectedValue: "v=DMARC1; p=quarantine" },
      ]),
    );
    getHosts.mockResolvedValueOnce([]);

    const diff = await previewDnsSync("d1");
    expect(diff.toAdd).toHaveLength(3);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.preserved).toHaveLength(0);
  });

  it("leaves an unrelated existing TXT record (e.g. google-site-verification) untouched", async () => {
    domainFindUnique.mockResolvedValueOnce(
      domainWithRecords([{ recordType: "SPF", hostname: "assessexpert.com", expectedValue: "v=spf1 a:infinit.email mx ~all" }]),
    );
    getHosts.mockResolvedValueOnce([
      { name: "@", type: "TXT", address: "google-site-verification=abc123", ttl: 1800 },
    ]);

    const diff = await previewDnsSync("d1");
    expect(diff.preserved).toHaveLength(1);
    expect(diff.preserved[0]!.address).toContain("google-site-verification");
    expect(diff.toAdd).toHaveLength(1); // the SPF record itself is still missing and gets added
  });

  it("replaces a conflicting duplicate SPF record instead of adding alongside it — the production bug class", async () => {
    domainFindUnique.mockResolvedValueOnce(
      domainWithRecords([{ recordType: "SPF", hostname: "assessexpert.com", expectedValue: "v=spf1 a:infinit.email mx ~all" }]),
    );
    getHosts.mockResolvedValueOnce([
      { name: "@", type: "TXT", address: "v=spf1 include:spf.efwd.registrar-servers.com ~all", ttl: 1800 },
      { name: "@", type: "TXT", address: "google-site-verification=abc123", ttl: 1800 },
    ]);

    const diff = await previewDnsSync("d1");
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toUpdate[0]!.before.address).toContain("registrar-servers.com");
    expect(diff.toAdd).toHaveLength(0);
    // The unrelated TXT at the same name/type must survive untouched.
    expect(diff.preserved).toHaveLength(1);
    expect(diff.preserved[0]!.address).toContain("google-site-verification");
    // Only one v=spf1 line ends up in the merged result — no duplicate.
    const spfCount = diff.mergedHosts.filter((h) => h.address.toLowerCase().startsWith("v=spf1")).length;
    expect(spfCount).toBe(1);
  });

  it("reports an already-correct record as unchanged", async () => {
    domainFindUnique.mockResolvedValueOnce(
      domainWithRecords([{ recordType: "SPF", hostname: "assessexpert.com", expectedValue: "v=spf1 a:infinit.email mx ~all" }]),
    );
    getHosts.mockResolvedValueOnce([{ name: "@", type: "TXT", address: "v=spf1 a:infinit.email mx ~all", ttl: 1800 }]);

    const diff = await previewDnsSync("d1");
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.toAdd).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
  });

  it("does not add an MX record for a domain with no MX in dns_records (external sourceType)", async () => {
    domainFindUnique.mockResolvedValueOnce(
      domainWithRecords([{ recordType: "SPF", hostname: "assessexpert.com", expectedValue: "v=spf1 a:infinit.email mx ~all" }]),
    );
    getHosts.mockResolvedValueOnce([]);

    const diff = await previewDnsSync("d1");
    expect(diff.toAdd.find((h) => h.type === "MX")).toBeUndefined();
  });
});

describe("applyDnsSync / rollbackDnsSync", () => {
  beforeEach(() => {
    domainFindUnique.mockReset();
    getNamecheapCredentials.mockReset().mockResolvedValue(creds);
    getHosts.mockReset();
    setHosts.mockReset();
    auditLogCreate.mockReset();
    auditLogFindUnique.mockReset();
    scheduleDnsRecheck.mockReset();
  });

  it("snapshots the current hosts before writing, then applies the merged set", async () => {
    domainFindUnique.mockResolvedValue(domainWithRecords([]));
    const before = [{ name: "www", type: "A" as const, address: "88.222.215.20", ttl: 1800 }];
    getHosts.mockResolvedValueOnce(before);
    auditLogCreate.mockResolvedValueOnce({ id: "audit-1" });

    const diff = {
      domainId: "d1",
      domainName: "assessexpert.com",
      toAdd: [],
      toUpdate: [],
      unchanged: [],
      preserved: before,
      mergedHosts: before,
    };
    const result = await applyDnsSync("d1", diff);

    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "domain.dns.registrar_sync_snapshot", metadata: expect.objectContaining({ hosts: before }) }),
      }),
    );
    expect(setHosts).toHaveBeenCalledWith(creds, "assessexpert.com", diff.mergedHosts);
    expect(scheduleDnsRecheck).toHaveBeenCalledWith("d1", 0);
    expect(result.auditLogId).toBe("audit-1");
  });

  it("rolls back by restoring the snapshotted host list", async () => {
    domainFindUnique.mockResolvedValue(domainWithRecords([]));
    const snapshotHosts = [{ name: "www", type: "A" as const, address: "88.222.215.20", ttl: 1800 }];
    auditLogFindUnique.mockResolvedValueOnce({
      id: "audit-1",
      action: "domain.dns.registrar_sync_snapshot",
      resourceId: "d1",
      metadata: { hosts: snapshotHosts },
    });

    await rollbackDnsSync("d1", "audit-1");

    expect(setHosts).toHaveBeenCalledWith(creds, "assessexpert.com", snapshotHosts);
    expect(scheduleDnsRecheck).toHaveBeenCalledWith("d1", 0);
  });

  it("refuses to roll back using a snapshot from a different domain", async () => {
    domainFindUnique.mockResolvedValue(domainWithRecords([]));
    auditLogFindUnique.mockResolvedValueOnce({
      id: "audit-1",
      action: "domain.dns.registrar_sync_snapshot",
      resourceId: "some-other-domain",
      metadata: { hosts: [] },
    });

    await expect(rollbackDnsSync("d1", "audit-1")).rejects.toThrow(/not found/i);
    expect(setHosts).not.toHaveBeenCalled();
  });
});
