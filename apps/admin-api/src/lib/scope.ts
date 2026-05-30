import { prisma, type Prisma } from "@ezmails/db";
import type { AuthUser } from "../plugins/auth.js";
import { Errors } from "./errors.js";

/**
 * Build a Prisma `where` clause restricting domains to those the user may see:
 *  - super_admin: all domains
 *  - reseller:   domains owned by the reseller or any of their customers
 *  - customer:   only their own domains
 */
export async function domainScope(user: AuthUser): Promise<Prisma.DomainWhereInput> {
  if (user.role === "super_admin") return {};
  if (user.role === "customer") return { ownerId: user.id };

  // reseller → self + child customers
  const children = await prisma.user.findMany({
    where: { parentId: user.id },
    select: { id: true },
  });
  return { ownerId: { in: [user.id, ...children.map((c) => c.id)] } };
}

/** Load a domain and assert the user is allowed to access it. */
export async function getScopedDomain(user: AuthUser, domainId: string) {
  const scope = await domainScope(user);
  const domain = await prisma.domain.findFirst({ where: { id: domainId, ...scope } });
  if (!domain) throw Errors.notFound("Domain not found.");
  return domain;
}

/** Load a mailbox and assert the user may access its domain. */
export async function getScopedMailbox(user: AuthUser, mailboxId: string) {
  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox) throw Errors.notFound("Mailbox not found.");
  await getScopedDomain(user, mailbox.domainId);
  return mailbox;
}

/** Generic guard for domain-owned child records (alias/forwarder/list). */
export async function assertChildAccess(user: AuthUser, domainId: string): Promise<void> {
  await getScopedDomain(user, domainId);
}
