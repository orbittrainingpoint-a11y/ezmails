/**
 * Minimal IANA-timezone helpers built on Intl (no new dependency). Used by the
 * booking flow so a link's configured availability (wall-clock hours in the
 * organizer's own timezone) maps to the correct UTC instants, DST included.
 */

/** Offset (minutes) such that `localWallClock = utcInstant + offsetMinutes`, at the given instant. */
function offsetMinutesAt(timeZone: string, utcInstant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utcInstant).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcInstant.getTime()) / 60_000;
}

/** The calendar date (Y-M-D) and weekday, as seen in `timeZone`, for a given UTC instant. */
export function zonedDateParts(utcInstant: Date, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(utcInstant).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

/** Convert a wall-clock date+time as seen in `timeZone` to the UTC instant it represents. */
export function zonedWallClockToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = offsetMinutesAt(timeZone, new Date(guess));
  return new Date(guess - offset * 60_000);
}
