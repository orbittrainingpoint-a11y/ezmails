import { describe, it, expect, vi, beforeEach } from "vitest";

const { domainUpdate, domainFindUnique, syncDnsRecordsForSourceType, scheduleDnsRecheck } = vi.hoisted(() => ({
  domainUpdate: vi.fn(),
  domainFindUnique: vi.fn(),
  syncDnsRecordsForSourceType: vi.fn(),
  scheduleDnsRecheck: vi.fn(),
}));

vi.mock("@ezmails/db", () => ({
  prisma: {
    domain: { update: domainUpdate, findUnique: domainFindUnique },
  },
}));

vi.mock("./dns.service.js", () => ({
  buildDnsRecords: vi.fn(() => []),
  syncDnsRecordsForSourceType,
}));

vi.mock("../lib/queue.js", () => ({ scheduleDnsRecheck }));

import { updateDomain } from "./domain.service.js";

describe("updateDomain — sourceType changes", () => {
  beforeEach(() => {
    domainUpdate.mockReset();
    domainFindUnique.mockReset();
    syncDnsRecordsForSourceType.mockReset();
    scheduleDnsRecheck.mockReset();
    domainFindUnique.mockResolvedValue({ id: "d1", domainName: "example.com", dnsRecords: [], dkimKeys: [] });
  });

  it("syncs DNS records and reschedules validation when sourceType changes", async () => {
    domainUpdate.mockResolvedValueOnce({ id: "d1", domainName: "example.com", sourceType: "external" });

    await updateDomain("d1", { sourceType: "external" });

    expect(syncDnsRecordsForSourceType).toHaveBeenCalledWith("d1", "example.com", "external");
    expect(scheduleDnsRecheck).toHaveBeenCalledWith("d1", 0);
  });

  it("does not touch DNS sync when sourceType isn't part of the patch", async () => {
    domainUpdate.mockResolvedValueOnce({ id: "d1", domainName: "example.com", sourceType: "vps_hosted" });

    await updateDomain("d1", { maxMailboxes: 50 });

    expect(syncDnsRecordsForSourceType).not.toHaveBeenCalled();
    expect(scheduleDnsRecheck).not.toHaveBeenCalled();
  });
});
