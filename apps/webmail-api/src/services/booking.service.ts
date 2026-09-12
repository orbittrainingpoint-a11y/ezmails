import { prisma, Prisma } from "@ezmails/db";
import { AppError } from "../lib/errors.js";
import { zonedDateParts, zonedWallClockToUtc } from "../lib/tz.js";

type Availability = Record<string, [string, string][]>; // { mon: [["09:00","17:00"]], ... }
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
type Db = typeof prisma | Prisma.TransactionClient;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "link";
}

export async function listLinks(mailboxId: string) {
  return prisma.bookingLink.findMany({
    where: { mailboxId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { bookings: true } } },
  });
}

export async function createLink(
  mailboxId: string,
  body: { title: string; description?: string; durationMins?: number; timezone?: string; availability: Availability },
) {
  let slug = slugify(body.title);
  // Ensure uniqueness.
  if (await prisma.bookingLink.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  return prisma.bookingLink.create({
    data: {
      mailboxId,
      slug,
      title: body.title,
      description: body.description,
      durationMins: body.durationMins ?? 30,
      timezone: body.timezone ?? "UTC",
      availability: body.availability,
    },
  });
}

export async function updateLink(mailboxId: string, id: string, body: Record<string, unknown>) {
  const link = await prisma.bookingLink.findFirst({ where: { id, mailboxId } });
  if (!link) throw new AppError(404, "NOT_FOUND", "Booking link not found.");
  return prisma.bookingLink.update({ where: { id }, data: body });
}

export async function deleteLink(mailboxId: string, id: string) {
  await prisma.bookingLink.deleteMany({ where: { id, mailboxId } });
}

export async function listBookings(mailboxId: string) {
  return prisma.booking.findMany({
    where: { link: { mailboxId } },
    orderBy: { startsAt: "asc" },
    include: { link: { select: { title: true, slug: true } } },
  });
}

export async function cancelBooking(mailboxId: string, id: string) {
  const b = await prisma.booking.findFirst({ where: { id, link: { mailboxId } } });
  if (!b) throw new AppError(404, "NOT_FOUND", "Booking not found.");
  return prisma.booking.update({ where: { id }, data: { cancelled: true } });
}

// ── Public booking flow ──

export async function getPublicLink(slug: string, db: Db = prisma) {
  const link = await db.bookingLink.findUnique({ where: { slug } });
  if (!link || !link.isActive) throw new AppError(404, "NOT_FOUND", "Booking link not found.");
  return link;
}

/**
 * Compute open slots for the next `days` days, excluding booked times.
 * Availability windows ("09:00"-"17:00") are wall-clock hours in the link's
 * OWN timezone, not the server's — a link configured for America/New_York
 * must actually open at 9am New York time, not 9am UTC.
 */
export async function getAvailableSlots(slug: string, days = 14, db: Db = prisma): Promise<string[]> {
  const link = await getPublicLink(slug, db);
  const avail = link.availability as Availability;
  const dur = link.durationMins;
  const tz = link.timezone;

  const booked = await db.booking.findMany({
    where: { bookingLinkId: link.id, cancelled: false, startsAt: { gte: new Date() } },
    select: { startsAt: true },
  });
  const taken = new Set(booked.map((b) => b.startsAt.toISOString()));

  const slots: string[] = [];
  const now = Date.now();
  const todayInTz = zonedDateParts(new Date(), tz);
  for (let d = 0; d < days; d++) {
    // Walk calendar days as seen in the link's own timezone, not the server's.
    const dayUtcNoon = new Date(Date.UTC(todayInTz.year, todayInTz.month - 1, todayInTz.day + d, 12));
    const { year, month, day, weekday } = zonedDateParts(dayUtcNoon, tz);
    const key = WEEKDAYS[weekday]!;
    for (const [from, to] of avail[key] ?? []) {
      const [fh, fm] = from.split(":").map(Number) as [number, number];
      const [th, tm] = to.split(":").map(Number) as [number, number];
      let t = zonedWallClockToUtc(year, month, day, fh, fm, tz).getTime();
      const end = zonedWallClockToUtc(year, month, day, th, tm, tz).getTime();
      while (t + dur * 60000 <= end) {
        const iso = new Date(t).toISOString();
        if (t > now && !taken.has(iso)) slots.push(iso);
        t += dur * 60000;
      }
    }
  }
  return slots;
}

export async function createBooking(slug: string, body: { name: string; email: string; startsAt: string; notes?: string }) {
  const link = await getPublicLink(slug);
  const start = new Date(body.startsAt);
  if (isNaN(start.getTime()) || start.getTime() < Date.now()) throw new AppError(400, "BAD_SLOT", "Invalid time slot.");
  const end = new Date(start.getTime() + link.durationMins * 60000);

  try {
    // SEC/correctness: Serializable isolation makes Postgres detect the classic
    // check-then-insert write-skew race (two concurrent requests for the same
    // slot both pass the availability check) and abort one side, rather than
    // silently double-booking. The read and write must run through the same
    // transaction (`tx`) for this guarantee to apply.
    return await prisma.$transaction(
      async (tx) => {
        const valid = await getAvailableSlots(slug, 14, tx);
        if (!valid.includes(start.toISOString())) throw new AppError(409, "SLOT_TAKEN", "That time is no longer available.");
        return tx.booking.create({
          data: { bookingLinkId: link.id, name: body.name, email: body.email, startsAt: start, endsAt: end, notes: body.notes },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new AppError(409, "SLOT_TAKEN", "That time is no longer available.");
    }
    throw err;
  }
}
