import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listAppPasswords, createAppPassword, revokeAppPassword } from "../services/apppassword.service.js";

/** App-specific passwords for configuring this mailbox in external mail clients. */
export default async function appPasswordRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/app-passwords", async (req, reply) => {
    return reply.send({ success: true, data: await listAppPasswords(req.creds!.mailboxId) });
  });

  app.post("/app-passwords", async (req, reply) => {
    const { label } = z.object({ label: z.string().min(1).max(100) }).parse(req.body);
    return reply.status(201).send({ success: true, data: await createAppPassword(req.creds!.mailboxId, label) });
  });

  app.delete("/app-passwords/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    return reply.send({ success: true, data: await revokeAppPassword(req.creds!.mailboxId, id) });
  });
}
