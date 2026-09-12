import type { FastifyInstance } from "fastify";
import { namecheapCredentialsSchema } from "../schemas/registrar.schema.js";
import { requireRole } from "../plugins/rbac.js";
import { recordAudit } from "../services/audit.service.js";
import { getNamecheapCredentials, setNamecheapCredentials } from "../lib/settings.js";
import { testConnection, NamecheapApiError } from "../services/registrars/namecheap.js";
import { Errors } from "../lib/errors.js";

export default async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  const adminOnly = requireRole("super_admin");

  // ── Registrar connection (DOM-021) ──
  app.get("/registrar/namecheap", { preHandler: adminOnly }, async (_req, reply) => {
    const creds = await getNamecheapCredentials();
    // Never return the decrypted API key to the client.
    return reply.send({
      success: true,
      data: creds ? { apiUser: creds.apiUser, username: creds.username, clientIp: creds.clientIp, configured: true } : { configured: false },
    });
  });

  app.put("/registrar/namecheap", { preHandler: adminOnly }, async (req, reply) => {
    const input = namecheapCredentialsSchema.parse(req.body);
    await setNamecheapCredentials(input);
    await recordAudit({
      userId: req.user!.id,
      action: "settings.registrar.namecheap.update",
      ipAddress: req.ip,
      metadata: { apiUser: input.apiUser, username: input.username },
    });
    return reply.send({ success: true });
  });

  app.post("/registrar/namecheap/test-connection", { preHandler: adminOnly }, async (_req, reply) => {
    const creds = await getNamecheapCredentials();
    if (!creds) throw Errors.badRequest("Save Namecheap credentials first.");
    try {
      await testConnection(creds);
      return reply.send({ success: true, data: { ok: true } });
    } catch (err) {
      const message = err instanceof NamecheapApiError ? err.message : "Connection failed.";
      return reply.send({ success: true, data: { ok: false, error: message } });
    }
  });
}
