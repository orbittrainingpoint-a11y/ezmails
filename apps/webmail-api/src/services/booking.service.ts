import { prisma } from "@ezmails/db";
import { AppError } from "../lib/errors.js";

type Availability = Record<string, [string, string][]>; // { mon: [["09:00","17:00"]], ... }
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

export async function getPublicLink(slug: string) {
  const link = await prisma.bookingLink.findUnique({ where: { slug } });
  if (!link || !link.isActive) throw new AppError(404, "NOT_FOUND", "Booking link not found.");
  return link;
}

/** Compute open slots for the next `days` days, excluding booked times. */
export async function getAvailableSlots(slug: string, days = 14): Promise<string[]> {
  const link = await getPublicLink(slug);
  const avail = link.availability as Availability;
  const dur = link.durationMins;

  const booked = await prisma.booking.findMany({
    where: { bookingLinkId: link.id, cancelled: false, startsAt: { gte: new Date() } },
    select: { startsAt: true },
  });
  const taken = new Set(booked.map((b) => b.startsAt.toISOString()));

  const slots: string[] = [];
  const now = Date.now();
  for (let d = 0; d < days; d++) {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() + d);
    const key = WEEKDAYS[day.getUTCDay()]!;
    for (const [from, to] of avail[key] ?? []) {
      const [fh, fm] = from.split(":").map(Number);
      const [th, tm] = to.split(":").map(Number);
      let t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), fh, fm);
      const end = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), th, tm);
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

  const valid = await getAvailableSlots(slug);
  if (!valid.includes(start.toISOString())) throw new AppError(409, "SLOT_TAKEN", "That time is no longer available.");

  const end = new Date(start.getTime() + link.durationMins * 60000);
  return prisma.booking.create({
    data: { bookingLinkId: link.id, name: body.name, email: body.email, startsAt: start, endsAt: end, notes: body.notes },
  });
}
