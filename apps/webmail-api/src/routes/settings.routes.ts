import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSettings, saveSettings } from "../services/settings.service.js";

const settingsSchema = z.object({
  signatureHtml: z.string().nullable().optional(),
  vacationEnabled: z.boolean().optional(),
  vacationStart: z.string().datetime().nullable().optional(),
  vacationEnd: z.string().datetime().nullable().optional(),
  vacationSubject: z.string().nullable().optional(),
  vacationMessage: z.string().nullable().optional(),
  prefs: z.record(z.unknown()).optional(),
});

export default async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/settings", async (req, reply) => reply.send({ success: true, data: await getSettings(req.creds!.mailboxId) }));

  app.put("/settings", async (req, reply) => {
    const body = settingsSchema.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.vacationStart !== undefined) data.vacationStart = body.vacationStart ? new Date(body.vacationStart) : null;
    if (body.vacationEnd !== undefined) data.vacationEnd = body.vacationEnd ? new Date(body.vacationEnd) : null;
    return reply.send({ success: true, data: await saveSettings(req.creds!.mailboxId, data) });
  });
}
