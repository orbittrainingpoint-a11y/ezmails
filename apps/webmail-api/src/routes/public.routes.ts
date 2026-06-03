import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@ezmails/db";
import { markOpened } from "../services/campaign.service.js";
import { recordOpen } from "../services/tracking.service.js";
import { getPublicLink, getAvailableSlots, createBooking } from "../services/booking.service.js";
import { buildIcs } from "../lib/ics.js";

// 1x1 transparent GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Public, unauthenticated endpoints: open tracking + the public booking flow. */
export default async function publicRoutes(app: FastifyInstance) {
  app.get("/public/track/open/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    await markOpened(token).catch(() => {});
    return reply.header("content-type", "image/gif").header("cache-control", "no-store").send(PIXEL);
  });

  // Read-tracking for individual sent emails (composer "Track").
  app.get("/public/track/email/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    await recordOpen(token).catch(() => {});
    return reply.header("content-type", "image/gif").header("cache-control", "no-store").send(PIXEL);
  });

  app.get("/public/bookings/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const link = await getPublicLink(slug);
    const slots = await getAvailableSlots(slug);
    return reply.send({
      success: true,
      data: { title: link.title, description: link.description, durationMins: link.durationMins, timezone: link.timezone, slots },
    });
  });

  app.post("/public/bookings/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = z.object({ name: z.string().min(1), email: z.string().email(), startsAt: z.string(), notes: z.string().optional() }).parse(req.body);
    const booking = await createBooking(slug, body);
    return reply.send({ success: true, data: { id: booking.id, startsAt: booking.startsAt, endsAt: booking.endsAt } });
  });

  app.get("/public/bookings/ics/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const booking = await prisma.booking.findUnique({ where: { id }, include: { link: true } });
    if (!booking) return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message: "Not found." } });
    const mailbox = await prisma.mailbox.findUnique({ where: { id: booking.link.mailboxId }, select: { email: true } });
    const ics = buildIcs({
      uid: booking.id,
      start: booking.startsAt,
      end: booking.endsAt,
      summary: booking.link.title,
      description: booking.notes ?? undefined,
      organizerEmail: mailbox?.email ?? "organizer@ezmails",
      attendeeEmail: booking.email,
    });
    return reply.header("content-type", "text/calendar").header("content-disposition", 'attachment; filename="booking.ics"').send(ics);
  });
}
