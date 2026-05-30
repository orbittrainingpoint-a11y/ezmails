import { z } from "zod";

// RFC 1035-ish domain validation (labels, IDNA handled upstream by the client).
const domainName = z
  .string()
  .min(3)
  .max(253)
  .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i, "Invalid domain name.");

export const createDomainSchema = z.object({
  domainName,
  sourceType: z.enum(["vps_hosted", "external"]).optional(),
  ownerId: z.string().uuid().optional(),
  nodeId: z.string().uuid().optional(),
  maxMailboxes: z.number().int().positive().optional(),
  storageQuota: z.coerce.bigint().positive().optional(),
  sendRate: z.number().int().positive().optional(),
  catchAll: z.string().email().optional(),
});

export const updateDomainSchema = z.object({
  ownerId: z.string().uuid().nullable().optional(),
  nodeId: z.string().uuid().nullable().optional(),
  maxMailboxes: z.number().int().positive().optional(),
  storageQuota: z.coerce.bigint().positive().optional(),
  sendRate: z.number().int().positive().optional(),
  catchAll: z.string().email().nullable().optional(),
  webmailEnabled: z.boolean().optional(),
  spamTagScore: z.number().int().optional(),
  spamRejectScore: z.number().int().optional(),
});

export const suspendDomainSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const listDomainsQuery = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});
