import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { Errors } from "../lib/errors.js";
import { ingestLogSchema } from "../schemas/ops.schema.js";
import { ingestLog } from "../services/log.service.js";

/**
 * Internal endpoints called by per-node agents / log shippers (Phase 12), not by
 * end users. Guarded by a shared secret (INTERNAL_TOKEN) rather than a JWT.
 */
export default async function internalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req) => {
    if (!env.INTERNAL_TOKEN || req.headers["x-internal-token"] !== env.INTERNAL_TOKEN) {
      throw Errors.unauthorized("Invalid internal token.");
    }
  });

  // LOG ingest — the node log shipper posts parsed Postfix log lines here.
  app.post("/logs/ingest", async (req, reply) => {
    const entry = ingestLogSchema.parse(req.body);
    const saved = await ingestLog(entry);
    return reply.status(201).send({ success: true, data: { id: saved.id } });
  });
}
