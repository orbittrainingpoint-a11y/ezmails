import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  importRecipients,
  sendCampaign,
} from "../services/campaign.service.js";

const upsert = z.object({ name: z.string().min(1), subject: z.string().min(1), bodyHtml: z.string().default("") });

export default async function campaignRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/campaigns", async (req, reply) => reply.send({ success: true, data: await listCampaigns(req.creds!.mailboxId) }));

  app.post("/campaigns", async (req, reply) => {
    const body = upsert.parse(req.body);
    return reply.send({ success: true, data: await createCampaign(req.creds!.mailboxId, body) });
  });

  app.get("/campaigns/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await getCampaign(req.creds!.mailboxId, id) });
  });

  app.patch("/campaigns/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = upsert.partial().parse(req.body);
    return reply.send({ success: true, data: await updateCampaign(req.creds!.mailboxId, id, body) });
  });

  app.delete("/campaigns/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteCampaign(req.creds!.mailboxId, id);
    return reply.send({ success: true });
  });

  app.post("/campaigns/:id/recipients", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
    return reply.send({ success: true, data: await importRecipients(req.creds!.mailboxId, id, csv) });
  });

  app.post("/campaigns/:id/send", async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await sendCampaign(req.creds!, req.creds!.mailboxId, id) });
  });
}
