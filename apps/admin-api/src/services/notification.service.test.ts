import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, update } = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@ezmails/db", () => ({
  prisma: { notification: { findUnique, update } },
}));

import { acknowledgeNotification, dismissNotification } from "./notification.service.js";

describe("notification ack/dismiss — ownership enforcement (IDOR regression)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it("allows a user to ack their own targeted notification", async () => {
    findUnique.mockResolvedValueOnce({ userId: "user-a" });
    update.mockResolvedValueOnce({ id: "n1" });
    await acknowledgeNotification("n1", "user-a");
    expect(update).toHaveBeenCalled();
  });

  it("allows any authenticated user to ack a broadcast notification (userId null)", async () => {
    findUnique.mockResolvedValueOnce({ userId: null });
    update.mockResolvedValueOnce({ id: "n1" });
    await acknowledgeNotification("n1", "user-b");
    expect(update).toHaveBeenCalled();
  });

  it("rejects acking another user's targeted notification", async () => {
    findUnique.mockResolvedValueOnce({ userId: "user-a" });
    await expect(acknowledgeNotification("n1", "user-b")).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects dismissing another user's targeted notification", async () => {
    findUnique.mockResolvedValueOnce({ userId: "user-a" });
    await expect(dismissNotification("n1", "user-b")).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("404s when the notification doesn't exist", async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(acknowledgeNotification("missing", "user-a")).rejects.toThrow(/not found/i);
  });
});
