import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { importFromImap } from "../services/import.service.js";

const schema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().default(993),
  secure: z.boolean().default(true),
  user: z.string().min(1),
  password: z.string().min(1),
  maxPerFolder: z.coerce.number().optional(),
});

export default async function importRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post("/import/imap", async (req, reply) => {
    const b = schema.parse(req.body);
    try {
      const result = await importFromImap(
        req.creds!,
        { host: b.host, port: b.port, secure: b.secure, user: b.user, password: b.password },
        { maxPerFolder: b.maxPerFolder },
      );
      return reply.send({ success: true, data: result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed.";
      throw new AppError(502, "IMPORT_FAILED", `Could not import: ${msg}`);
    }
  });
}
