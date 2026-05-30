import type { FastifyInstance } from "fastify";
import { requireRole } from "../plugins/rbac.js";
import { recordAudit } from "../services/audit.service.js";
import {
  logSearchQuery,
  queueListQuery,
  queueActionSchema,
  queueFlushSchema,
  registerNodeSchema,
  decommissionNodeSchema,
  thresholdsSchema,
  accessRuleSchema,
} from "../schemas/ops.schema.js";
import { getDashboard, getVolumeSeries, getTopDomains } from "../services/dashboard.service.js";
import { searchLogs, getTrace, exportCsv } from "../services/log.service.js";
import { listQueue, retryMessage, deleteMessage, flushQueue } from "../services/queue.service.js";
import { registerNode, listNodes, getNodeStats, decommissionNode } from "../services/node.service.js";
import {
  getThresholds,
  setThresholds,
  listAccessRules,
  createAccessRule,
  deleteAccessRule,
  getScoreDistribution,
  listQuarantine,
  releaseQuarantine,
  deleteQuarantine,
} from "../services/spam.service.js";

export default async function opsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);
  const admin = requireRole("super_admin");

  // ─────────── Dashboard (DASH-*) ───────────
  app.get("/dashboard", { preHandler: admin }, async (_req, reply) =>
    reply.send({ success: true, data: await getDashboard() }),
  );
  app.get("/dashboard/volume", { preHandler: admin }, async (_req, reply) =>
    reply.send({ success: true, data: await getVolumeSeries() }),
  );
  app.get("/dashboard/top-domains", { preHandler: admin }, async (_req, reply) =>
    reply.send({ success: true, data: await getTopDomains() }),
  );

  // ─────────── Mail queue (QUEUE-*) ───────────
  app.get("/queue", { preHandler: admin }, async (req, reply) => {
    const q = queueListQuery.parse(req.query);
    return reply.send({ success: true, data: await listQueue(q) });
  });
  app.post("/queue/flush", { preHandler: admin }, async (req, reply) => {
    const { nodeId } = queueFlushSchema.parse(req.body ?? {});
    const result = await flushQueue(nodeId);
    await recordAudit({ userId: req.user!.id, action: "queue.flush", ipAddress: req.ip, metadata: { nodeId } });
    return reply.send({ success: true, data: result });
  });
  app.post("/queue/:queueId/retry", { preHandler: admin }, async (req, reply) => {
    const { queueId } = req.params as { queueId: string };
    const { nodeId } = queueActionSchema.parse(req.body);
    const data = await retryMessage(nodeId, queueId);
    await recordAudit({ userId: req.user!.id, action: "queue.retry", ipAddress: req.ip, metadata: { queueId } });
    return reply.send({ success: true, data });
  });
  app.delete("/queue/:queueId", { preHandler: admin }, async (req, reply) => {
    const { queueId } = req.params as { queueId: string };
    const { nodeId } = queueActionSchema.parse(req.body);
    const data = await deleteMessage(nodeId, queueId);
    await recordAudit({ userId: req.user!.id, action: "queue.delete", ipAddress: req.ip, metadata: { queueId } });
    return reply.send({ success: true, data });
  });

  // ─────────── Mail logs (LOG-*) ───────────
  app.get("/logs", { preHandler: admin }, async (req, reply) => {
    const f = logSearchQuery.parse(req.query);
    return reply.send({ success: true, data: await searchLogs(f) });
  });
  app.get("/logs/export", { preHandler: admin }, async (req, reply) => {
    const f = logSearchQuery.parse(req.query);
    const csv = await exportCsv(f);
    return reply
      .header("content-type", "text/csv")
      .header("content-disposition", 'attachment; filename="mail-log.csv"')
      .send(csv);
  });
  app.get("/logs/:queueId", { preHandler: admin }, async (req, reply) => {
    const { queueId } = req.params as { queueId: string };
    return reply.send({ success: true, data: await getTrace(queueId) });
  });

  // ─────────── Nodes (NODE-*) ───────────
  app.get("/nodes", { preHandler: admin }, async (_req, reply) =>
    reply.send({ success: true, data: await listNodes() }),
  );
  app.post("/nodes", { preHandler: admin }, async (req, reply) => {
    const node = await registerNode(registerNodeSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "node.register", resourceType: "node", resourceId: node.id, ipAddress: req.ip });
    return reply.status(201).send({ success: true, data: node });
  });
  app.get("/nodes/:id/stats", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({ success: true, data: await getNodeStats(id) });
  });
  app.delete("/nodes/:id", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { migrateToId } = decommissionNodeSchema.parse(req.body ?? {});
    await decommissionNode(id, migrateToId);
    await recordAudit({ userId: req.user!.id, action: "node.decommission", resourceType: "node", resourceId: id, ipAddress: req.ip, metadata: { migrateToId } });
    return reply.send({ success: true });
  });

  // ─────────── Spam & deliverability (SPAM-*) ───────────
  app.get("/spam/thresholds", { preHandler: admin }, async (_req, reply) =>
    reply.send({ success: true, data: await getThresholds() }),
  );
  app.put("/spam/thresholds", { preHandler: admin }, async (req, reply) => {
    const data = await setThresholds(thresholdsSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "spam.thresholds.update", ipAddress: req.ip, metadata: { ...data } });
    return reply.send({ success: true, data });
  });
  app.get("/spam/score-distribution", { preHandler: admin }, async (_req, reply) =>
    reply.send({ success: true, data: await getScoreDistribution() }),
  );
  app.get("/spam/access-rules", { preHandler: admin }, async (req, reply) => {
    const { domainId } = req.query as { domainId?: string };
    return reply.send({ success: true, data: await listAccessRules(domainId) });
  });
  app.post("/spam/access-rules", { preHandler: admin }, async (req, reply) => {
    const rule = await createAccessRule(accessRuleSchema.parse(req.body));
    await recordAudit({ userId: req.user!.id, action: "spam.access_rule.create", resourceType: "access_rule", resourceId: rule.id, ipAddress: req.ip });
    return reply.status(201).send({ success: true, data: rule });
  });
  app.delete("/spam/access-rules/:id", { preHandler: admin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await deleteAccessRule(id);
    await recordAudit({ userId: req.user!.id, action: "spam.access_rule.delete", resourceType: "access_rule", resourceId: id, ipAddress: req.ip });
    return reply.send({ success: true });
  });
  app.get("/spam/quarantine/:nodeId", { preHandler: admin }, async (req, reply) => {
    const { nodeId } = req.params as { nodeId: string };
    return reply.send({ success: true, data: await listQuarantine(nodeId) });
  });
  app.post("/spam/quarantine/:nodeId/:id/release", { preHandler: admin }, async (req, reply) => {
    const { nodeId, id } = req.params as { nodeId: string; id: string };
    return reply.send({ success: true, data: await releaseQuarantine(nodeId, id) });
  });
  app.delete("/spam/quarantine/:nodeId/:id", { preHandler: admin }, async (req, reply) => {
    const { nodeId, id } = req.params as { nodeId: string; id: string };
    return reply.send({ success: true, data: await deleteQuarantine(nodeId, id) });
  });
}
