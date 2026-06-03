import { prisma, type Prisma } from "@ezmails/db";
import { Errors } from "../lib/errors.js";
import { createInitialDkim } from "./dkim.service.js";
import { buildDnsRecords } from "./dns.service.js";

export interface CreateDomainInput {
  domainName: string;
  sourceType?: "vps_hosted" | "external";
  ownerId?: string;
  nodeId?: string;
  maxMailboxes?: number;
  storageQuota?: bigint;
  sendRate?: number;
  catchAll?: string;
}

/**
 * DOM-001/002: create a domain, generate its DKIM key, and persist the full set
 * of required DNS records (MX/SPF/DKIM/DMARC) ready for the validation panel.
 */
export async function createDomain(input: CreateDomainInput) {
  const domainName = input.domainName.trim().toLowerCase();

  const existing = await prisma.domain.findUnique({ where: { domainName } });
  if (existing) throw Errors.conflict("That domain is already managed by Infinit Email.");

  const domain = await prisma.domain.create({
    data: {
      domainName,
      sourceType: input.sourceType ?? "vps_hosted",
      ownerId: input.ownerId,
      nodeId: input.nodeId,
      maxMailboxes: input.maxMailboxes,
      storageQuota: input.storageQuota,
      sendRate: input.sendRate,
      catchAll: input.catchAll,
    },
  });

  const dkim = await createInitialDkim(domain.id, domain.domainName);

  const records = buildDnsRecords(domain.domainName, dkim);
  await prisma.dnsRecord.createMany({
    data: records.map((r) => ({
      domainId: domain.id,
      recordType: r.recordType,
      hostname: r.hostname,
      expectedValue: r.expectedValue,
      status: "unchecked" as const,
    })),
  });

  return getDomainDetail(domain.id);
}

export async function listDomains(
  scope: Prisma.DomainWhereInput,
  opts: { search?: string; page?: number; pageSize?: number },
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where: Prisma.DomainWhereInput = {
    ...scope,
    ...(opts.search ? { domainName: { contains: opts.search.toLowerCase() } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.domain.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { mailboxes: true, aliases: true } } },
    }),
    prisma.domain.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getDomainDetail(id: string) {
  const domain = await prisma.domain.findUnique({
    where: { id },
    include: {
      dnsRecords: { orderBy: { recordType: "asc" } },
      dkimKeys: { orderBy: { createdAt: "desc" } },
      node: { select: { id: true, name: true, hostname: true } },
      owner: { select: { id: true, email: true, displayName: true } },
      _count: { select: { mailboxes: true, aliases: true, forwarders: true } },
    },
  });
  if (!domain) throw Errors.notFound("Domain not found.");
  return domain;
}

const DOMAIN_PATCH_FIELDS = [
  "nodeId",
  "ownerId",
  "maxMailboxes",
  "storageQuota",
  "sendRate",
  "catchAll",
  "webmailEnabled",
  "spamTagScore",
  "spamRejectScore",
] as const;

export async function updateDomain(id: string, patch: Record<string, unknown>) {
  const data: Prisma.DomainUpdateInput = {};
  for (const key of DOMAIN_PATCH_FIELDS) {
    if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  }
  await prisma.domain.update({ where: { id }, data });
  return getDomainDetail(id);
}

/** DOM-015: suspend a domain (halts inbound/outbound) with a reason note. */
export async function setDomainSuspended(id: string, suspended: boolean, reason?: string) {
  await prisma.domain.update({
    where: { id },
    data: { isActive: !suspended, suspendReason: suspended ? (reason ?? "Suspended by admin") : null },
  });
  return getDomainDetail(id);
}

/** DOM-016: delete a domain (cascades to mailboxes, aliases, DNS, DKIM). */
export async function deleteDomain(id: string) {
  await prisma.domain.delete({ where: { id } });
}
