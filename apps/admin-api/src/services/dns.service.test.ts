import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "../config/env.js";

vi.mock("../lib/dns.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/dns.js")>("../lib/dns.js");
  return { ...actual, resolveDns: vi.fn() };
});

import { resolveDns } from "../lib/dns.js";
import { buildDnsRecords, checkRecord } from "./dns.service.js";

const mockResolveDns = vi.mocked(resolveDns);

describe("buildDnsRecords", () => {
  const dkim = { selector: "ezmails-20260101", dnsValue: "v=DKIM1; k=rsa; p=ABC" };

  it("includes an MX record for vps_hosted domains", () => {
    const records = buildDnsRecords("example.com", dkim, "vps_hosted");
    expect(records.find((r) => r.recordType === "MX")).toBeTruthy();
  });

  it("omits the MX record for external domains", () => {
    const records = buildDnsRecords("example.com", dkim, "external");
    expect(records.find((r) => r.recordType === "MX")).toBeUndefined();
    // SPF/DKIM/DMARC are still required so outbound mail authenticates.
    expect(records.find((r) => r.recordType === "SPF")).toBeTruthy();
    expect(records.find((r) => r.recordType === "DKIM")).toBeTruthy();
    expect(records.find((r) => r.recordType === "DMARC")).toBeTruthy();
  });

  it("defaults to vps_hosted when sourceType is omitted", () => {
    const records = buildDnsRecords("example.com", dkim);
    expect(records.find((r) => r.recordType === "MX")).toBeTruthy();
  });
});

describe("checkRecord — SPF/DMARC duplicate detection", () => {
  beforeEach(() => mockResolveDns.mockReset());

  it("passes a single valid SPF record", async () => {
    mockResolveDns.mockResolvedValueOnce([`"v=spf1 a:${env.MAIL_HOSTNAME} mx ~all"`]);
    const result = await checkRecord({
      recordType: "SPF",
      hostname: "example.com",
      expectedValue: `v=spf1 a:${env.MAIL_HOSTNAME} mx ~all`,
    });
    expect(result.status).toBe("valid");
  });

  it("flags a duplicate SPF record as incorrect (the production PermError bug)", async () => {
    mockResolveDns.mockResolvedValueOnce([
      `"v=spf1 a:${env.MAIL_HOSTNAME} mx ~all"`,
      `"v=spf1 include:spf.efwd.registrar-servers.com ~all"`,
    ]);
    const result = await checkRecord({
      recordType: "SPF",
      hostname: "example.com",
      expectedValue: `v=spf1 a:${env.MAIL_HOSTNAME} mx ~all`,
    });
    expect(result.status).toBe("incorrect");
    expect(result.actual).toMatch(/2 SPF records found/);
    expect(result.actual).toMatch(/RFC 7208/);
  });

  it("reports missing when no SPF record exists", async () => {
    mockResolveDns.mockResolvedValueOnce([]);
    const result = await checkRecord({
      recordType: "SPF",
      hostname: "example.com",
      expectedValue: `v=spf1 a:${env.MAIL_HOSTNAME} mx ~all`,
    });
    expect(result.status).toBe("missing");
  });

  it("passes a single valid DMARC record", async () => {
    mockResolveDns.mockResolvedValueOnce([`"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"`]);
    const result = await checkRecord({
      recordType: "DMARC",
      hostname: "_dmarc.example.com",
      expectedValue: "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com",
    });
    expect(result.status).toBe("valid");
  });

  it("flags a duplicate DMARC record as incorrect", async () => {
    mockResolveDns.mockResolvedValueOnce([
      `"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"`,
      `"v=DMARC1; p=none"`,
    ]);
    const result = await checkRecord({
      recordType: "DMARC",
      hostname: "_dmarc.example.com",
      expectedValue: "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com",
    });
    expect(result.status).toBe("incorrect");
    expect(result.actual).toMatch(/2 DMARC records found/);
    expect(result.actual).toMatch(/RFC 7489/);
  });

  it("treats a DNS resolution error as propagating, not a hard failure", async () => {
    mockResolveDns.mockRejectedValueOnce(new Error("DoH query failed: 500"));
    const result = await checkRecord({
      recordType: "SPF",
      hostname: "example.com",
      expectedValue: `v=spf1 a:${env.MAIL_HOSTNAME} mx ~all`,
    });
    expect(result.status).toBe("propagating");
  });
});
