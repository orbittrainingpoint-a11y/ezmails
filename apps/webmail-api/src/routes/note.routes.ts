import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listNotes, createNote, updateNote, deleteNote } from "../services/note.service.js";

export default async function noteRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/notes", async (req, reply) => {
    const { messageId } = z.object({ messageId: z.string().min(1) }).parse(req.query);
    return reply.send({ success: true, data: await listNotes(req.creds!.mailboxId, messageId) });
  });

  app.post("/notes", async (req, reply) => {
    const body = z.object({ messageId: z.string().min(1), title: z.string().optional(), body: z.string().min(1), color: z.string().optional() }).parse(req.body);
    return reply.send({ success: true, data: await createNote(req.creds!.mailboxId, body) });
  });

  app.patch("/notes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ title: z.string().optional(), body: z.string().optional(), color: z.string().optional(), pinned: z.boolean().optional() }).parse(req.body);
    return reply.send({ success: true, data: await updateNote(req.creds!.mailboxId, id, body) });
  });

  app.delete("/notes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteNote(req.creds!.mailboxId, id);
    return reply.send({ success: true });
  });
}
