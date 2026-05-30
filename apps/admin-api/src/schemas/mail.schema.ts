import { z } from "zod";

// ── Mailboxes ──
export const createMailboxSchema = z.object({
  localPart: z.string().min(1).max(64),
  displayName: z.string().max(255).optional(),
  password: z.string().min(8),
  quota: z.coerce.bigint().positive().optional(),
  sendLimit: z.number().int().positive().optional(),
  recvLimit: z.number().int().positive().optional(),
});

export const updateMailboxSchema = z.object({
  displayName: z.string().max(255).optional(),
  quota: z.coerce.bigint().positive().optional(),
  sendLimit: z.number().int().positive().optional(),
  recvLimit: z.number().int().positive().optional(),
  password: z.string().min(8).optional(),
});

export const resetPasswordSchema = z.object({ password: z.string().min(8) });

export const listMailboxesQuery = z.object({
  search: z.string().optional(),
  sort: z.enum(["email", "displayName", "quota", "lastLoginAt", "status", "createdAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const importRow = z.object({
  address: z.string(),
  displayName: z.string().optional(),
  password: z.string(),
  quota: z.string().optional(),
});

// Accept either a raw CSV string or pre-parsed rows.
export const importSchema = z.object({
  csv: z.string().optional(),
  rows: z.array(importRow).optional(),
});

// ── Aliases ──
export const createAliasSchema = z.object({
  source: z.string().min(1),
  destination: z.string().min(1), // comma-separated
  isWildcard: z.boolean().optional(),
});
export const updateAliasSchema = z.object({ destination: z.string().min(1) });

// ── Forwarders ──
export const createForwarderSchema = z.object({
  source: z.string().min(1),
  destination: z.string().email(),
  keepCopy: z.boolean().optional(),
});

// ── Mailing lists ──
export const createListSchema = z.object({
  localPart: z.string().min(1),
  name: z.string().min(1).max(255),
  moderated: z.boolean().optional(),
  members: z.array(z.string()).optional(),
});
export const addMembersSchema = z.object({
  emails: z.array(z.string()).optional(),
  csv: z.string().optional(),
});
