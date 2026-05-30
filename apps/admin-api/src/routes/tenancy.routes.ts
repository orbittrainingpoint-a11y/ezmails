import type { FastifyInstance } from "fastify";
import { UserRole } from "@ezmails/db";
import { requireRole } from "../plugins/rbac.js";
import { recordAudit } from "../services/audit.service.js";
import {
  createCustomerSchema,
  createResellerSchema,
  quotaSchema,
  emailAlertsSchema,
  createBackupSchema,
  restoreSchema,
  createTokenSchema,
} from "../schemas/tenancy.schema.js";
import {
  createCustomer,
  createReseller,
  listUsers,
  getScopedUser,
  getUsage,
  setUserSuspended,
  deleteUser,
  promoteToReseller,
  updateReseller,
} from "../services/user.service.js";
import {
  listNotifications,
  acknowledgeNotification,
  dismissNotification,
  getEmailAlertSettings,
  setEmailAlertSettings,
} from "../services/notification.service.js";
import { listBackups, getBackup, createBackup, triggerBackup, restoreBackup } from "../services/backup.service.js";
import { listTokens, createToken, revokeToken } from "../services/apitoken.service.js";

export default async function tenancyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  const canManage = requireRole("super_admin", "reseller");
  const admin = requireRole("super_admin");

  // ─────────── Customers (CUST-*) ───────────
  app.get("/customers", { preHandler: canManage }, async (req, reply) =>
    reply.send({ success: true, data: await listUsers(req.user!, UserRole.customer) }),
  );

  app.post("/customers", { preHandler: canManage }, async (req, reply) => {
    const customer = await createCustomer(req.user!, createCustomerSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "customer.create", resourceType: "user", resourceId: customer.id, ipAddress: req.ip, metadata: { email: customer.email } });
    return reply.status(201).send({ success: true, data: customer });
  });

  app.get("/customers/:id", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await getScopedUser(req.user!, id);
    return reply.send({ success: true, data: user });
  });

  app.get("/customers/:id/usage", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedUser(req.user!, id);
    return reply.send({ success: true, data: await getUsage(id) });
  });

  app.post("/customers/:id/suspend", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedUser(req.user!, id);
    const user = await setUserSuspended(id, true);
    await recordAudit({ userId: req.user!.id, action: "customer.suspend", resourceType: "user", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true, data: user });
  });

  app.post("/customers/:id/reactivate", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedUser(req.user!, id);
    const user = await setUserSuspended(id, false);
    await recordAudit({ userId: req.user!.id, action: "customer.reactivate", resourceType: "user", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true, data: user });
  });

  app.delete("/customers/:id", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedUser(req.user!, id);
    await deleteUser(id);
    await recordAudit({ userId: req.user!.id, action: "customer.delete", resourceType: "user", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true });
  });

  // RBAC-005: promote a customer to reseller (admin only).
  app.post("/customers/:id/promote", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await promoteToReseller(id, quotaSchema.parse(req.body ?? {}));
    await recordAudit({ userId: req.user!.id, action: "customer.promote", resourceType: "user", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true, data: user });
  });

  // ─────────── Resellers (RES-*) — admin only ───────────
  app.get("/resellers", { preHandler: admin }, async (req, reply) =>
    reply.send({ success: true, data: await listUsers(req.user!, UserRole.reseller) }),
  );

  app.post("/resellers", { preHandler: admin }, async (req, reply) => {
    const reseller = await createReseller(createResellerSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "reseller.create", resourceType: "user", resourceId: reseller.id, ipAddress: req.ip });
    return reply.status(201).send({ success: true, data: reseller });
  });

  app.get("/resellers/:id/usage", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await getUsage(id) });
  });

  app.patch("/resellers/:id", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const reseller = await updateReseller(id, quotaSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "reseller.update_quota", resourceType: "user", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true, data: reseller });
  });

  // ─────────── Notifications (NOTIF-*) ───────────
  app.get("/notifications", async (req, reply) => {
    const { unreadOnly } = req.query as { unreadOnly?: string };
    return reply.send({ success: true, data: await listNotifications(req.user!.id, { unreadOnly: unreadOnly === "true" }) });
  });
  app.post("/notifications/:id/ack", async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await acknowledgeNotification(id) });
  });
  app.post("/notifications/:id/dismiss", async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await dismissNotification(id) });
  });
  app.get("/notifications/settings/email", { preHandler: admin }, async (_req, reply) =>
    reply.send({ success: true, data: await getEmailAlertSettings() }),
  );
  app.put("/notifications/settings/email", { preHandler: admin }, async (req, reply) => {
    const data = await setEmailAlertSettings(emailAlertsSchema.parse(req.body));
    return reply.send({ success: true, data });
  });

  // ─────────── Backups (BKP-*) — admin only ───────────
  app.get("/backups", { preHandler: admin }, async (_req, reply) =>
    reply.send({ success: true, data: await listBackups() }),
  );
  app.post("/backups", { preHandler: admin }, async (req, reply) => {
    const job = await createBackup(createBackupSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "backup.create", resourceType: "backup", resourceId: job.id, ipAddress: req.ip });
    return reply.status(201).send({ success: true, data: job });
  });
  app.get("/backups/:id", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await getBackup(id) });
  });
  app.post("/backups/:id/run", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await triggerBackup(id);
    return reply.send({ success: true });
  });
  app.post("/backups/:id/restore", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { target } = restoreSchema.parse(req.body ?? {});
    const data = await restoreBackup(id, target);
    await recordAudit({ userId: req.user!.id, action: "backup.restore", resourceType: "backup", resourceId: id, ipAddress: req.ip, metadata: { target } });
    return reply.send({ success: true, data });
  });

  // ─────────── API tokens (API-*) — per-user ───────────
  app.get("/api-tokens", async (req, reply) =>
    reply.send({ success: true, data: await listTokens(req.user!.id) }),
  );
  app.post("/api-tokens", async (req, reply) => {
    const { name, expiresAt } = createTokenSchema.parse(req.body);
    const data = await createToken(req.user!.id, name, expiresAt ? new Date(expiresAt) : undefined);
    await recordAudit({ userId: req.user!.id, action: "api_token.create", resourceType: "api_token", resourceId: data.id, ipAddress: req.ip });
    return reply.status(201).send({ success: true, data });
  });
  app.delete("/api-tokens/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await revokeToken(req.user!.id, id);
    await recordAudit({ userId: req.user!.id, action: "api_token.revoke", resourceType: "api_token", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true });
  });
}
