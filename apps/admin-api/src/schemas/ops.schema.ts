import { z } from "zod";

// ── Logs ──
export const logSearchQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sender: z.string().optional(),
  recipient: z.string().optional(),
  status: z.enum(["delivered", "bounced", "deferred", "rejected"]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

export const ingestLogSchema = z.object({
  queueId: z.string().optional(),
  sender: z.string(),
  recipient: z.string(),
  status: z.enum(["delivered", "bounced", "deferred", "rejected"]),
  sizeBytes: z.number().int().optional(),
  relay: z.string().optional(),
  delayMs: z.number().int().optional(),
  spamScore: z.number().optional(),
  detail: z.string().optional(),
  nodeId: z.string().uuid().optional(),
});

// ── Queue ──
export const queueListQuery = z.object({
  senderDomain: z.string().optional(),
  recipientDomain: z.string().optional(),
  reason: z.string().optional(),
});
export const queueActionSchema = z.object({ nodeId: z.string().uuid() });
export const queueFlushSchema = z.object({ nodeId: z.string().uuid().optional() });

// ── Nodes ──
export const registerNodeSchema = z.object({
  name: z.string().min(1).max(100),
  hostname: z.string().min(1).max(255),
  ipAddress: z.string().ip(),
  sshPort: z.number().int().positive().max(65535).optional(),
});
export const decommissionNodeSchema = z.object({ migrateToId: z.string().uuid().optional() });

// ── Spam ──
export const thresholdsSchema = z.object({
  tag: z.number(),
  greylist: z.number(),
  reject: z.number(),
});
export const accessRuleSchema = z.object({
  domainId: z.string().uuid().nullable().optional(),
  action: z.enum(["allow", "deny"]),
  kind: z.enum(["ip", "domain"]),
  value: z.string().min(1).max(255),
  note: z.string().max(255).optional(),
});
