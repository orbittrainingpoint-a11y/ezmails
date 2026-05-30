import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8),
  domainIds: z.array(z.string().uuid()).optional(),
  storageQuota: z.coerce.bigint().positive().optional(),
  mailboxQuota: z.number().int().positive().optional(),
  resellerId: z.string().uuid().optional(), // admin may nest under a reseller
});

export const createResellerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8),
  maxCustomers: z.number().int().positive().optional(),
  maxDomains: z.number().int().positive().optional(),
  storagePool: z.coerce.bigint().positive().optional(),
});

export const quotaSchema = z.object({
  maxCustomers: z.number().int().positive().optional(),
  maxDomains: z.number().int().positive().optional(),
  storagePool: z.coerce.bigint().positive().optional(),
});

export const emailAlertsSchema = z.object({
  enabled: z.boolean(),
  address: z.string().email().nullable(),
});

export const createBackupSchema = z.object({
  scope: z.string().min(1), // "all" | domainId | mailboxId
  destination: z.string().min(1),
  schedule: z.string().optional(), // cron pattern; omit for one-off
});

export const restoreSchema = z.object({ target: z.string().optional() });

export const createTokenSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});
