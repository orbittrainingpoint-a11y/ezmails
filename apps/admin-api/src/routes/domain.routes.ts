import type { FastifyInstance } from "fastify";
import {
  createDomainSchema,
  updateDomainSchema,
  suspendDomainSchema,
  listDomainsQuery,
} from "../schemas/domain.schema.js";
import { requireRole } from "../plugins/rbac.js";
import { domainScope, getScopedDomain } from "../lib/scope.js";
import { recordAudit } from "../services/audit.service.js";
import {
  createDomain,
  listDomains,
  getDomainDetail,
  updateDomain,
  setDomainSuspended,
  deleteDomain,
} from "../services/domain.service.js";
import { validateDomainDns } from "../services/dns.service.js";
import { listDkimKeys, rotateDkim } from "../services/dkim.service.js";

export default async function domainRoutes(app: FastifyInstance) {
  // All domain routes require authentication.
  app.addHook("preHandler", app.authenticate);

  const canManage = requireRole("super_admin", "reseller");

  // ── List (scoped) ──
  app.get("/", async (req, reply) => {
    const q = listDomainsQuery.parse(req.query);
    const scope = await domainScope(req.user!);
    return reply.send({ success: true, data: await listDomains(scope, q) });
  });

  // ── Create ──
  app.post("/", { preHandler: canManage }, async (req, reply) => {
    const input = createDomainSchema.parse(req.body);
    // Resellers may only assign domains to themselves or their own customers.
    const ownerId = req.user!.role === "reseller" ? (input.ownerId ?? req.user!.id) : input.ownerId;
    const domain = await createDomain({ ...input, ownerId });
    await recordAudit({
      userId: req.user!.id,
      action: "domain.create",
      resourceType: "domain",
      resourceId: domain.id,
      ipAddress: req.ip,
      metadata: { domainName: domain.domainName },
    });
    return reply.status(201).send({ success: true, data: domain });
  });

  // ── Detail ──
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    return reply.send({ success: true, data: await getDomainDetail(id) });
  });

  // ── Update settings ──
  app.patch("/:id", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    const patch = updateDomainSchema.parse(req.body);
    const domain = await updateDomain(id, patch);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.update",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: patch as Record<string, unknown>,
    });
    return reply.send({ success: true, data: domain });
  });

  // ── Delete ──
  app.delete("/:id", { preHandler: requireRole("super_admin") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getScopedDomain(req.user!, id);
    await deleteDomain(id);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.delete",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { domainName: domain.domainName },
    });
    return reply.send({ success: true });
  });

  // ── Suspend / unsuspend (DOM-015) ──
  app.post("/:id/suspend", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    const { reason } = suspendDomainSchema.parse(req.body ?? {});
    const domain = await setDomainSuspended(id, true, reason);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.suspend",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { reason },
    });
    return reply.send({ success: true, data: domain });
  });

  app.post("/:id/unsuspend", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    const domain = await setDomainSuspended(id, false);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.unsuspend",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
    });
    return reply.send({ success: true, data: domain });
  });

  // ── DNS records + validation (DOM-003/005/006) ──
  app.get("/:id/dns", async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getScopedDomain(req.user!, id);
    const records = await getDomainDetail(domain.id);
    return reply.send({ success: true, data: records.dnsRecords });
  });

  app.post("/:id/dns/validate", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    const results = await validateDomainDns(id);
    return reply.send({ success: true, data: results });
  });

  // ── DKIM (DKIM-002/003/004) ──
  app.get("/:id/dkim", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    return reply.send({ success: true, data: await listDkimKeys(id) });
  });

  app.post("/:id/dkim/rotate", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getScopedDomain(req.user!, id);
    const key = await rotateDkim(id, domain.domainName);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.dkim.rotate",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { selector: key.selector },
    });
    return reply.send({ success: true, data: key });
  });
}
