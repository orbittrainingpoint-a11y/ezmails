import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listRules, createRule, updateRule, deleteRule, applyRules } from "../services/rule.service.js";

const condition = z.object({
  field: z.enum(["from", "to", "subject", "body"]),
  op: z.enum(["contains", "equals", "startsWith"]),
  value: z.string().min(1),
});
const createSchema = z.object({
  name: z.string().min(1),
  matchType: z.enum(["all", "any"]).default("all"),
  conditions: z.array(condition).min(1),
  targetFolder: z.string().min(1),
  markRead: z.boolean().optional(),
});

export default async function ruleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/rules", async (req, reply) => reply.send({ success: true, data: await listRules(req.creds!.mailboxId) }));

  app.post("/rules", async (req, reply) => {
    const body = createSchema.parse(req.body);
    return reply.send({ success: true, data: await createRule(req.creds!.mailboxId, body) });
  });

  app.patch("/rules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createSchema.partial().extend({ enabled: z.boolean().optional() }).parse(req.body);
    return reply.send({ success: true, data: await updateRule(req.creds!.mailboxId, id, body) });
  });

  app.delete("/rules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteRule(req.creds!.mailboxId, id);
    return reply.send({ success: true });
  });

  app.post("/rules/apply", async (req, reply) => {
    const { folder } = z.object({ folder: z.string().default("INBOX") }).parse(req.body ?? {});
    return reply.send({ success: true, data: await applyRules(req.creds!, req.creds!.mailboxId, folder) });
  });
}
