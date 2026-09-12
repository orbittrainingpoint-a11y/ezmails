import { describe, it, expect } from "vitest";
import { zonedDateParts, zonedWallClockToUtc } from "./tz.js";

describe("zonedWallClockToUtc — booking timezone regression", () => {
  it("converts 9am New York (winter, UTC-5) to 14:00 UTC", () => {
    const utc = zonedWallClockToUtc(2027, 1, 15, 9, 0, "America/New_York");
    expect(utc.toISOString()).toBe("2027-01-15T14:00:00.000Z");
  });

  it("converts 9am New York (summer, UTC-4 DST) to 13:00 UTC", () => {
    const utc = zonedWallClockToUtc(2027, 7, 15, 9, 0, "America/New_York");
    expect(utc.toISOString()).toBe("2027-07-15T13:00:00.000Z");
  });

  it("UTC timezone is a no-op", () => {
    const utc = zonedWallClockToUtc(2027, 3, 1, 9, 30, "UTC");
    expect(utc.toISOString()).toBe("2027-03-01T09:30:00.000Z");
  });
});

describe("zonedDateParts", () => {
  it("reports the correct calendar day/weekday in a different timezone (day boundary)", () => {
    // 02:00 UTC on Jan 15 is still 21:00 Jan 14 in New York — a link
    // configured for New York must see this as Thursday the 14th, not
    // Friday the 15th (the UTC-only bug this replaces would get this wrong).
    const parts = zonedDateParts(new Date("2027-01-15T02:00:00.000Z"), "America/New_York");
    expect(parts).toEqual({ year: 2027, month: 1, day: 14, weekday: 4 }); // Thursday
  });
});
