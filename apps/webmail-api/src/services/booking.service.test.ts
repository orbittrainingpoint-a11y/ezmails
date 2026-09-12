import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, findMany, transaction, FakeKnownRequestError } = vi.hoisted(() => {
  class FakeKnownRequestError extends Error {
    code: string;
    constructor(code: string) {
      super("known request error");
      this.code = code;
      Object.setPrototypeOf(this, FakeKnownRequestError.prototype);
    }
  }
  return { findUnique: vi.fn(), findMany: vi.fn(), transaction: vi.fn(), FakeKnownRequestError };
});

vi.mock("@ezmails/db", () => ({
  prisma: {
    bookingLink: { findUnique },
    booking: { findMany },
    $transaction: transaction,
  },
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
    PrismaClientKnownRequestError: FakeKnownRequestError,
  },
}));

import { getAvailableSlots, createBooking } from "./booking.service.js";

const nyLink = {
  id: "link-1",
  slug: "demo",
  isActive: true,
  durationMins: 30,
  timezone: "America/New_York",
  availability: { fri: [["09:00", "10:00"]] },
};

describe("getAvailableSlots — timezone regression", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset();
  });

  it("opens at 9am in the link's own timezone, not 9am UTC", async () => {
    findUnique.mockResolvedValue(nyLink);
    findMany.mockResolvedValue([]);

    const slots = await getAvailableSlots("demo", 14);
    // Find a Friday slot among the results and confirm it lands at 14:00 UTC
    // (= 9am EST), not 09:00 UTC (the old, wrong UTC-only behavior).
    const fridaySlot = slots.find((iso) => iso.endsWith("14:00:00.000Z") || iso.endsWith("13:00:00.000Z"));
    expect(fridaySlot).toBeDefined();
    expect(slots.some((iso) => iso.endsWith("09:00:00.000Z"))).toBe(false);
  });
});

describe("createBooking — double-booking race regression", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset();
    transaction.mockReset();
  });

  it("maps a Postgres serialization failure (P2034) to 409 SLOT_TAKEN instead of crashing", async () => {
    findUnique.mockResolvedValue(nyLink);
    transaction.mockRejectedValueOnce(new FakeKnownRequestError("P2034"));

    await expect(
      createBooking("demo", { name: "A", email: "a@example.com", startsAt: new Date(Date.now() + 3600_000).toISOString() }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SLOT_TAKEN" });
  });

  it("runs the check-then-create inside a Serializable transaction", async () => {
    findUnique.mockResolvedValue(nyLink);
    transaction.mockImplementationOnce(async (_fn: unknown, opts: { isolationLevel: string }) => {
      expect(opts.isolationLevel).toBe("Serializable");
      return { id: "booking-1" };
    });

    const result = await createBooking("demo", {
      name: "A",
      email: "a@example.com",
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(result).toEqual({ id: "booking-1" });
  });
});
