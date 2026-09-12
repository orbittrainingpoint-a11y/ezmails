import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateMany, findFirst } = vi.hoisted(() => ({ updateMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@ezmails/db", () => ({
  prisma: { webmailRule: { updateMany, findFirst } },
}));

import { updateRule } from "./rule.service.js";

describe("updateRule — response scoping (IDOR regression)", () => {
  beforeEach(() => {
    updateMany.mockReset();
    findFirst.mockReset();
  });

  it("scopes both the update and the returned row to the caller's mailboxId", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    findFirst.mockResolvedValueOnce({ id: "r1", mailboxId: "mbx-1", name: "my rule" });

    const result = await updateRule("mbx-1", "r1", { name: "renamed" });

    expect(updateMany).toHaveBeenCalledWith({ where: { id: "r1", mailboxId: "mbx-1" }, data: { name: "renamed" } });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "r1", mailboxId: "mbx-1" } });
    expect(result).toEqual({ id: "r1", mailboxId: "mbx-1", name: "my rule" });
  });

  it("returns null instead of another mailbox's rule when the id belongs elsewhere", async () => {
    // updateMany silently affects 0 rows (id belongs to a different mailbox); the
    // old bug re-fetched by bare id and leaked that other mailbox's rule anyway.
    updateMany.mockResolvedValueOnce({ count: 0 });
    findFirst.mockResolvedValueOnce(null);

    const result = await updateRule("mbx-attacker", "r1-belongs-to-someone-else", { name: "x" });

    expect(findFirst).toHaveBeenCalledWith({ where: { id: "r1-belongs-to-someone-else", mailboxId: "mbx-attacker" } });
    expect(result).toBeNull();
  });
});
