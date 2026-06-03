import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiEnabled } from "../lib/ai.js";
import { draftEmail, quickReply, summarizeEmail, fixGrammar } from "../services/ai.service.js";

export default async function aiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/ai/status", async (_req, reply) => reply.send({ success: true, data: { enabled: aiEnabled() } }));

  app.post("/ai/draft", async (req, reply) => {
    const body = z.object({ instruction: z.string().min(3), tone: z.string().optional() }).parse(req.body);
    return reply.send({ success: true, data: await draftEmail(body) });
  });

  app.post("/ai/reply", async (req, reply) => {
    const body = z.object({ original: z.string().min(1), instruction: z.string().optional(), tone: z.string().optional() }).parse(req.body);
    return reply.send({ success: true, data: await quickReply(body) });
  });

  app.post("/ai/grammar", async (req, reply) => {
    const body = z.object({ text: z.string().min(1), html: z.boolean().optional() }).parse(req.body);
    return reply.send({ success: true, data: await fixGrammar(body) });
  });

  app.post("/ai/summarize", async (req, reply) => {
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    return reply.send({ success: true, data: await summarizeEmail(body) });
  });
}
