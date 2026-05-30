import type { FastifyInstance } from "fastify";
import {
  createMailboxSchema,
  updateMailboxSchema,
  resetPasswordSchema,
  listMailboxesQuery,
  importSchema,
  createAliasSchema,
  updateAliasSchema,
  createForwarderSchema,
  createListSchema,
  addMembersSchema,
} from "../schemas/mail.schema.js";
import { requireRole } from "../plugins/rbac.js";
import { getScopedDomain, getScopedMailbox } from "../lib/scope.js";
import { recordAudit } from "../services/audit.service.js";
import { parseCsvWithHeader } from "../lib/csv.js";
import {
  createMailbox,
  listMailboxes,
  getMailbox,
  updateMailbox,
  resetMailboxPassword,
  setMailboxSuspended,
  deleteMailbox,
  previewImport,
  commitImport,
  type ImportRow,
} from "../services/mailbox.service.js";
import {
  createAlias,
  listAliases,
  updateAliasDestination,
  getAlias,
  deleteAlias,
} from "../services/alias.service.js";
import {
  createForwarder,
  listForwarders,
  getForwarder,
  deleteForwarder,
} from "../services/forwarder.service.js";
import {
  createList,
  listLists,
  getList,
  addMembers,
  removeMember,
  deleteList,
} from "../services/list.service.js";

/** Resolve import rows from either a raw CSV string or a pre-parsed array. */
function resolveImportRows(body: { csv?: string; rows?: ImportRow[] }): ImportRow[] {
  if (body.rows?.length) return body.rows;
  if (body.csv) {
    return parseCsvWithHeader(body.csv).map((r) => ({
      address: r["address"] ?? "",
      displayName: r["display name"] ?? r["displayname"] ?? "",
      password: r["password"] ?? "",
      quota: r["quota"] || undefined,
    }));
  }
  return [];
}

export default async function mailRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  const canManage = requireRole("super_admin", "reseller");

  // ─────────────── Mailboxes (customers may manage their own — CUST-003) ───────────────

  app.get("/domains/:domainId/mailboxes", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    await getScopedDomain(req.user!, domainId);
    const q = listMailboxesQuery.parse(req.query);
    return reply.send({ success: true, data: await listMailboxes(domainId, q) });
  });

  app.post("/domains/:domainId/mailboxes", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    const domain = await getScopedDomain(req.user!, domainId);
    const input = createMailboxSchema.parse(req.body);
    const mbx = await createMailbox(domain, input);
    await recordAudit({
      userId: req.user!.id,
      action: "mailbox.create",
      resourceType: "mailbox",
      resourceId: mbx.id,
      ipAddress: req.ip,
      metadata: { email: mbx.email },
    });
    return reply.status(201).send({ success: true, data: mbx });
  });

  // CSV import preview (MBX-005) + commit (MBX-004)
  app.post("/domains/:domainId/mailboxes/import/preview", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    const domain = await getScopedDomain(req.user!, domainId);
    const rows = resolveImportRows(importSchema.parse(req.body));
    return reply.send({ success: true, data: previewImport(rows, domain) });
  });

  app.post("/domains/:domainId/mailboxes/import", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    const domain = await getScopedDomain(req.user!, domainId);
    const rows = resolveImportRows(importSchema.parse(req.body));
    const result = await commitImport(rows, domain);
    await recordAudit({
      userId: req.user!.id,
      action: "mailbox.import",
      resourceType: "domain",
      resourceId: domainId,
      ipAddress: req.ip,
      metadata: { created: result.created },
    });
    return reply.send({ success: true, data: result });
  });

  app.get("/mailboxes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedMailbox(req.user!, id);
    return reply.send({ success: true, data: await getMailbox(id) });
  });

  app.patch("/mailboxes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedMailbox(req.user!, id);
    const patch = updateMailboxSchema.parse(req.body);
    const mbx = await updateMailbox(id, patch);
    await recordAudit({
      userId: req.user!.id,
      action: "mailbox.update",
      resourceType: "mailbox",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { fields: Object.keys(patch).filter((k) => k !== "password") },
    });
    return reply.send({ success: true, data: mbx });
  });

  app.post("/mailboxes/:id/reset-password", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedMailbox(req.user!, id);
    const { password } = resetPasswordSchema.parse(req.body);
    await resetMailboxPassword(id, password);
    await recordAudit({
      userId: req.user!.id,
      action: "mailbox.reset_password",
      resourceType: "mailbox",
      resourceId: id,
      ipAddress: req.ip,
    });
    return reply.send({ success: true });
  });

  app.post("/mailboxes/:id/suspend", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedMailbox(req.user!, id);
    const mbx = await setMailboxSuspended(id, true);
    await recordAudit({ userId: req.user!.id, action: "mailbox.suspend", resourceType: "mailbox", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true, data: mbx });
  });

  app.post("/mailboxes/:id/unsuspend", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedMailbox(req.user!, id);
    const mbx = await setMailboxSuspended(id, false);
    await recordAudit({ userId: req.user!.id, action: "mailbox.unsuspend", resourceType: "mailbox", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true, data: mbx });
  });

  app.delete("/mailboxes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const mbx = await getScopedMailbox(req.user!, id);
    await deleteMailbox(id);
    await recordAudit({
      userId: req.user!.id,
      action: "mailbox.delete",
      resourceType: "mailbox",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { email: mbx.email },
    });
    return reply.send({ success: true });
  });

  // ─────────────── Aliases (admin / reseller) ───────────────

  app.get("/domains/:domainId/aliases", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    await getScopedDomain(req.user!, domainId);
    return reply.send({ success: true, data: await listAliases(domainId) });
  });

  app.post("/domains/:domainId/aliases", { preHandler: canManage }, async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    const domain = await getScopedDomain(req.user!, domainId);
    const alias = await createAlias(domain, createAliasSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "alias.create", resourceType: "alias", resourceId: alias.id, ipAddress: req.ip, metadata: { source: alias.source } });
    return reply.status(201).send({ success: true, data: alias });
  });

  app.patch("/aliases/:id", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const alias = await getAlias(id);
    await getScopedDomain(req.user!, alias.domainId);
    const { destination } = updateAliasSchema.parse(req.body);
    const updated = await updateAliasDestination(id, destination);
    await recordAudit({ userId: req.user!.id, action: "alias.update", resourceType: "alias", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true, data: updated });
  });

  app.delete("/aliases/:id", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const alias = await getAlias(id);
    await getScopedDomain(req.user!, alias.domainId);
    await deleteAlias(id);
    await recordAudit({ userId: req.user!.id, action: "alias.delete", resourceType: "alias", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true });
  });

  // ─────────────── Forwarders (admin / reseller) ───────────────

  app.get("/domains/:domainId/forwarders", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    await getScopedDomain(req.user!, domainId);
    return reply.send({ success: true, data: await listForwarders(domainId) });
  });

  app.post("/domains/:domainId/forwarders", { preHandler: canManage }, async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    const domain = await getScopedDomain(req.user!, domainId);
    const { forwarder, dmarcWarning } = await createForwarder(domain, createForwarderSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "forwarder.create", resourceType: "forwarder", resourceId: forwarder.id, ipAddress: req.ip, metadata: { source: forwarder.source } });
    return reply.status(201).send({ success: true, data: forwarder, warning: dmarcWarning });
  });

  app.delete("/forwarders/:id", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const fwd = await getForwarder(id);
    await getScopedDomain(req.user!, fwd.domainId);
    await deleteForwarder(id);
    await recordAudit({ userId: req.user!.id, action: "forwarder.delete", resourceType: "forwarder", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true });
  });

  // ─────────────── Mailing lists (admin / reseller) ───────────────

  app.get("/domains/:domainId/lists", async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    await getScopedDomain(req.user!, domainId);
    return reply.send({ success: true, data: await listLists(domainId) });
  });

  app.post("/domains/:domainId/lists", { preHandler: canManage }, async (req, reply) => {
    const { domainId } = req.params as { domainId: string };
    const domain = await getScopedDomain(req.user!, domainId);
    const list = await createList(domain, createListSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "list.create", resourceType: "mailing_list", resourceId: list.id, ipAddress: req.ip, metadata: { address: list.address } });
    return reply.status(201).send({ success: true, data: list });
  });

  app.get("/lists/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = await getList(id);
    await getScopedDomain(req.user!, list.domainId);
    return reply.send({ success: true, data: list });
  });

  app.post("/lists/:id/members", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = await getList(id);
    await getScopedDomain(req.user!, list.domainId);
    const body = addMembersSchema.parse(req.body);
    const emails = body.emails ?? (body.csv ? parseCsvWithHeader(body.csv).map((r) => r["email"] ?? "") : []);
    const updated = await addMembers(id, emails.filter(Boolean));
    await recordAudit({ userId: req.user!.id, action: "list.add_members", resourceType: "mailing_list", resourceId: id, ipAddress: req.ip, metadata: { count: emails.length } });
    return reply.send({ success: true, data: updated });
  });

  app.delete("/lists/:id/members/:memberId", { preHandler: canManage }, async (req, reply) => {
    const { id, memberId } = req.params as { id: string; memberId: string };
    const list = await getList(id);
    await getScopedDomain(req.user!, list.domainId);
    await removeMember(memberId);
    return reply.send({ success: true });
  });

  app.delete("/lists/:id", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = await getList(id);
    await getScopedDomain(req.user!, list.domainId);
    await deleteList(id);
    await recordAudit({ userId: req.user!.id, action: "list.delete", resourceType: "mailing_list", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true });
  });
}
