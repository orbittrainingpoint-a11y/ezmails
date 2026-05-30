import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listLinks, createLink, updateLink, deleteLink, listBookings, cancelBooking } from "../services/booking.service.js";

const availability = z.record(z.array(z.tuple([z.string(), z.string()])));
const createLinkSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  durationMins: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  availability,
});

export default async function bookingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/booking-links", async (req, reply) => reply.send({ success: true, data: await listLinks(req.creds!.mailboxId) }));

  app.post("/booking-links", async (req, reply) => {
    const body = createLinkSchema.parse(req.body);
    return reply.send({ success: true, data: await createLink(req.creds!.mailboxId, body) });
  });

  app.patch("/booking-links/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createLinkSchema.partial().parse(req.body);
    return reply.send({ success: true, data: await updateLink(req.creds!.mailboxId, id, body) });
  });

  app.delete("/booking-links/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteLink(req.creds!.mailboxId, id);
    return reply.send({ success: true });
  });

  app.get("/bookings", async (req, reply) => reply.send({ success: true, data: await listBookings(req.creds!.mailboxId) }));

  app.post("/bookings/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await cancelBooking(req.creds!.mailboxId, id) });
  });
}
