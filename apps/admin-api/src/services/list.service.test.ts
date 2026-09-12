import { describe, it, expect, vi, beforeEach } from "vitest";

const { deleteMany } = vi.hoisted(() => ({ deleteMany: vi.fn() }));
vi.mock("@ezmails/db", () => ({
  prisma: { mailingListMember: { deleteMany } },
}));

import { removeMember } from "./list.service.js";

describe("removeMember — cross-tenant deletion (IDOR regression)", () => {
  beforeEach(() => deleteMany.mockReset());

  it("scopes the delete to both the member id AND the list id", async () => {
    deleteMany.mockResolvedValueOnce({ count: 1 });
    await removeMember("list-1", "member-1");
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "member-1", listId: "list-1" } });
  });

  it("throws not-found instead of silently succeeding when the member belongs to a different list", async () => {
    // e.g. reseller B calling DELETE /lists/<their own list>/members/<reseller A's member id>
    deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(removeMember("resellerB-list", "resellerA-member")).rejects.toThrow(/not found/i);
  });
});
