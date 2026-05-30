import { prisma, UserRole, type Prisma } from "@ezmails/db";
import { Errors, AppError } from "../lib/errors.js";
import { hashPassword } from "./auth.service.js";
import type { AuthUser } from "../plugins/auth.js";

const publicUser = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  parentId: true,
  isActive: true,
  maxCustomers: true,
  maxDomains: true,
  storagePool: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** Customers/resellers a user may see: admin → all; reseller → own children. */
function userScope(actor: AuthUser, role: UserRole): Prisma.UserWhereInput {
  if (actor.role === "super_admin") return { role };
  return { role, parentId: actor.id };
}

async function assignDomains(actor: AuthUser, customerId: string, domainIds: string[], quota?: bigint, maxMailboxes?: number) {
  for (const id of domainIds) {
    // Only assign domains the actor controls.
    const where: Prisma.DomainWhereInput =
      actor.role === "super_admin"
        ? { id }
        : { id, OR: [{ ownerId: actor.id }, { owner: { parentId: actor.id } }] };
    const domain = await prisma.domain.findFirst({ where });
    if (!domain) throw Errors.notFound(`Domain ${id} not found or not yours to assign.`);
    await prisma.domain.update({
      where: { id },
      data: { ownerId: customerId, storageQuota: quota, maxMailboxes },
    });
  }
}

/** CUST-001: create a customer with assigned domains and quotas. */
export async function createCustomer(
  actor: AuthUser,
  input: {
    name: string;
    email: string;
    password: string;
    domainIds?: string[];
    storageQuota?: bigint;
    mailboxQuota?: number;
    resellerId?: string;
  },
) {
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw Errors.conflict("Email already in use.");

  const parentId = actor.role === "reseller" ? actor.id : (input.resellerId ?? null);

  // RES: enforce the reseller's customer cap.
  if (parentId) {
    const reseller = await prisma.user.findUnique({ where: { id: parentId } });
    if (!reseller || reseller.role !== UserRole.reseller) throw Errors.notFound("Reseller not found.");
    if (reseller.maxCustomers != null) {
      const count = await prisma.user.count({ where: { parentId, role: UserRole.customer } });
      if (count >= reseller.maxCustomers) {
        throw new AppError(409, "RESELLER_QUOTA_EXCEEDED", "Reseller customer limit reached.", {
          current: count,
          max: reseller.maxCustomers,
        });
      }
    }
  }

  const user = await prisma.user.create({
    data: {
      email,
      displayName: input.name,
      passwordHash: await hashPassword(input.password),
      role: UserRole.customer,
      parentId,
      storagePool: input.storageQuota,
    },
    select: publicUser,
  });

  if (input.domainIds?.length) {
    await assignDomains(actor, user.id, input.domainIds, input.storageQuota, input.mailboxQuota);
  }
  return user;
}

/** RES-001: create a reseller with quota pool (admin only). */
export async function createReseller(input: {
  name: string;
  email: string;
  password: string;
  maxCustomers?: number;
  maxDomains?: number;
  storagePool?: bigint;
}) {
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw Errors.conflict("Email already in use.");
  return prisma.user.create({
    data: {
      email,
      displayName: input.name,
      passwordHash: await hashPassword(input.password),
      role: UserRole.reseller,
      maxCustomers: input.maxCustomers,
      maxDomains: input.maxDomains,
      storagePool: input.storagePool,
    },
    select: publicUser,
  });
}

export async function listUsers(actor: AuthUser, role: UserRole) {
  return prisma.user.findMany({ where: userScope(actor, role), orderBy: { createdAt: "desc" }, select: publicUser });
}

/** Load a customer/reseller the actor is allowed to see. */
export async function getScopedUser(actor: AuthUser, id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicUser });
  if (!user) throw Errors.notFound("User not found.");
  if (actor.role !== "super_admin" && user.parentId !== actor.id) throw Errors.forbidden();
  return user;
}

/** CUST-005 / RES-003: usage report for a customer (or aggregated for a reseller). */
export async function getUsage(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("User not found.");

  // For a reseller, include domains owned by their customers too.
  const ownerIds =
    user.role === UserRole.reseller
      ? [user.id, ...(await prisma.user.findMany({ where: { parentId: user.id }, select: { id: true } })).map((u) => u.id)]
      : [user.id];

  const domains = await prisma.domain.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true, domainName: true, storageQuota: true } });
  const domainIds = domains.map((d) => d.id);
  const domainNames = domains.map((d) => d.domainName);

  const [mailboxCount, allocated, sent, received] = await Promise.all([
    prisma.mailbox.count({ where: { domainId: { in: domainIds } } }),
    domains.reduce((sum, d) => sum + d.storageQuota, 0n),
    domainNames.length
      ? prisma.mailLog.count({ where: { OR: domainNames.map((n) => ({ sender: { endsWith: `@${n}` } })) } })
      : 0,
    domainNames.length
      ? prisma.mailLog.count({ where: { OR: domainNames.map((n) => ({ recipient: { endsWith: `@${n}` } })) } })
      : 0,
  ]);

  return {
    domains: domains.length,
    mailboxes: mailboxCount,
    storageAllocated: allocated,
    messagesSent: sent,
    messagesReceived: received,
  };
}

/** CUST-004: suspend / reactivate a customer (freezes login + their domains). */
export async function setUserSuspended(id: string, suspended: boolean) {
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { isActive: !suspended } }),
    prisma.domain.updateMany({ where: { ownerId: id }, data: { isActive: !suspended } }),
  ]);
  return prisma.user.findUnique({ where: { id }, select: publicUser });
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } });
}

/** RBAC-005: promote a customer to reseller. */
export async function promoteToReseller(id: string, quota: { maxCustomers?: number; maxDomains?: number; storagePool?: bigint }) {
  return prisma.user.update({
    where: { id },
    data: { role: UserRole.reseller, parentId: null, ...quota },
    select: publicUser,
  });
}

/** RES-005: adjust a reseller's quota at any time. */
export async function updateReseller(id: string, patch: { maxCustomers?: number; maxDomains?: number; storagePool?: bigint }) {
  return prisma.user.update({ where: { id }, data: patch, select: publicUser });
}
