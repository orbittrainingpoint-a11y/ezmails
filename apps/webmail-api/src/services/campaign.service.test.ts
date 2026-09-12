import { describe, it, expect, vi, beforeEach } from "vitest";

const { findFirst, createMany } = vi.hoisted(() => ({ findFirst: vi.fn(), createMany: vi.fn() }));
vi.mock("@ezmails/db", () => ({
  prisma: { campaign: { findFirst }, campaignRecipient: { createMany } },
}));

import { importRecipients } from "./campaign.service.js";

describe("importRecipients — abuse-prevention row cap", () => {
  beforeEach(() => {
    findFirst.mockReset();
    createMany.mockReset();
  });

  it("rejects a CSV with more than the max allowed recipient rows", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1", mailboxId: "mbx-1" });
    const header = "email\n";
    const rows = Array.from({ length: 2001 }, (_, i) => `user${i}@example.com`).join("\n");

    await expect(importRecipients("mbx-1", "c1", header + rows)).rejects.toMatchObject({ statusCode: 400 });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("accepts a CSV within the row limit", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1", mailboxId: "mbx-1" });
    createMany.mockResolvedValueOnce({ count: 2 });
    const csv = "email\na@example.com\nb@example.com";

    const result = await importRecipients("mbx-1", "c1", csv);
    expect(result.imported).toBe(2);
    expect(createMany).toHaveBeenCalled();
  });
});
