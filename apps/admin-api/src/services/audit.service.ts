import { prisma } from "@ezmails/db";

// AUTH-006 / RBAC: every meaningful action is recorded with actor, IP, and UA.
export async function recordAudit(input: {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata as object | undefined,
      ipAddress: input.ipAddress,
    },
  });
}
