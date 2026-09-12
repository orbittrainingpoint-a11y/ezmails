import { z } from "zod";

// Mirrors the backend's domain-name validation (apps/admin-api/src/schemas/domain.schema.ts).
const domainName = z
  .string()
  .min(3, "Domain name is too short.")
  .max(253)
  .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i, "Enter a valid domain name, e.g. example.com.");

export const createDomainFormSchema = z.object({
  domainName,
  sourceType: z.enum(["vps_hosted", "external"]),
});
export type CreateDomainForm = z.infer<typeof createDomainFormSchema>;

export const domainSettingsFormSchema = z.object({
  sourceType: z.enum(["vps_hosted", "external"]),
  maxMailboxes: z.coerce.number().int().positive("Must be a positive number."),
  storageQuota: z.string().min(1, "Required."),
  sendRate: z.coerce.number().int().positive("Must be a positive number."),
  catchAll: z.union([z.literal(""), z.string().email("Enter a valid email.")]),
  webmailEnabled: z.boolean(),
});
export type DomainSettingsForm = z.infer<typeof domainSettingsFormSchema>;
