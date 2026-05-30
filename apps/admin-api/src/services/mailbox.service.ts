import { prisma, type Domain, type Prisma } from "@ezmails/db";
import { Errors, AppError } from "../lib/errors.js";
import { dovecotPassword, assertPasswordPolicy } from "../lib/password.js";

const LOCAL_PART = /^[a-z0-9._%+-]+$/i;

function buildEmail(localPart: string, domainName: string) {
  return `${localPart.trim().toLowerCase()}@${domainName}`;
}

function maildirFor(domainName: string, localPart: string) {
  return `${domainName}/${localPart.trim().toLowerCase()}/`;
}

export interface CreateMailboxInput {
  localPart: string;
  displayName?: string;
  password: string;
  quota?: bigint;
  sendLimit?: number;
  recvLimit?: number;
}

/** MBX-001: create a mailbox, enforcing the domain's mailbox cap and password policy. */
export async function createMailbox(domain: Domain, input: CreateMailboxInput) {
  if (!LOCAL_PART.test(input.localPart)) throw Errors.conflict("Invalid mailbox local part.");
  const policyErr = assertPasswordPolicy(input.password);
  if (policyErr) throw new AppError(400, "WEAK_PASSWORD", policyErr);

  const email = buildEmail(input.localPart, domain.domainName);
  const existing = await prisma.mailbox.findUnique({ where: { email } });
  if (existing) throw Errors.conflict("A mailbox with that address already exists.");

  // DOM-009: respect the per-domain mailbox limit.
  const count = await prisma.mailbox.count({ where: { domainId: domain.id } });
  if (count >= domain.maxMailboxes) {
    throw new AppError(
      409,
      "DOMAIN_QUOTA_EXCEEDED",
      "This domain has reached its maximum mailbox count.",
      { current: count, max: domain.maxMailboxes },
    );
  }

  return prisma.mailbox.create({
    data: {
      domainId: domain.id,
      email,
      localPart: input.localPart.trim().toLowerCase(),
      displayName: input.displayName,
      password: dovecotPassword(input.password),
      quota: input.quota,
      maildir: maildirFor(domain.domainName, input.localPart),
      sendLimit: input.sendLimit,
      recvLimit: input.recvLimit,
    },
    select: mailboxSelect,
  });
}

// Never expose the password hash.
const mailboxSelect = {
  id: true,
  domainId: true,
  email: true,
  localPart: true,
  displayName: true,
  quota: true,
  sendLimit: true,
  recvLimit: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MailboxSelect;

const SORTABLE = ["email", "displayName", "quota", "lastLoginAt", "status", "createdAt"] as const;
type Sortable = (typeof SORTABLE)[number];

/** MBX-010/011/012: list with search + sortable columns + paging. */
export async function listMailboxes(
  domainId: string,
  opts: { search?: string; sort?: string; order?: "asc" | "desc"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const sort: Sortable = (SORTABLE as readonly string[]).includes(opts.sort ?? "")
    ? (opts.sort as Sortable)
    : "email";

  const where: Prisma.MailboxWhereInput = {
    domainId,
    ...(opts.search
      ? {
          OR: [
            { email: { contains: opts.search.toLowerCase() } },
            { displayName: { contains: opts.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.mailbox.findMany({
      where,
      orderBy: { [sort]: opts.order ?? "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: mailboxSelect,
    }),
    prisma.mailbox.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getMailbox(id: string) {
  const mbx = await prisma.mailbox.findUnique({ where: { id }, select: mailboxSelect });
  if (!mbx) throw Errors.notFound("Mailbox not found.");
  return mbx;
}

/** MBX-006: edit any field except the local part. */
export async function updateMailbox(
  id: string,
  patch: { displayName?: string; quota?: bigint; sendLimit?: number; recvLimit?: number; password?: string },
) {
  const data: Prisma.MailboxUpdateInput = {};
  if (patch.displayName !== undefined) data.displayName = patch.displayName;
  if (patch.quota !== undefined) data.quota = patch.quota;
  if (patch.sendLimit !== undefined) data.sendLimit = patch.sendLimit;
  if (patch.recvLimit !== undefined) data.recvLimit = patch.recvLimit;
  if (patch.password !== undefined) {
    const policyErr = assertPasswordPolicy(patch.password);
    if (policyErr) throw new AppError(400, "WEAK_PASSWORD", policyErr);
    data.password = dovecotPassword(patch.password);
  }
  await prisma.mailbox.update({ where: { id }, data });
  return getMailbox(id);
}

/** MBX-007: admin reset without knowing the current password. */
export async function resetMailboxPassword(id: string, newPassword: string) {
  return updateMailbox(id, { password: newPassword });
}

/** MBX-008: suspend / unsuspend (disables login + inbound delivery via status). */
export async function setMailboxSuspended(id: string, suspended: boolean) {
  await prisma.mailbox.update({
    where: { id },
    data: { status: suspended ? "suspended" : "active" },
  });
  return getMailbox(id);
}

/** MBX-009: delete (message export before deletion is handled by the backup module, Phase 5). */
export async function deleteMailbox(id: string) {
  await prisma.mailbox.delete({ where: { id } });
}

// ─────────────────────── CSV bulk import (MBX-004/005) ───────────────────────

export interface ImportRow {
  address: string;
  displayName?: string;
  password: string;
  quota?: string; // bytes as string, optional
}

interface ImportResult {
  index: number;
  address: string;
  valid: boolean;
  errors: string[];
  created?: boolean;
}

/** Validate a single import row against the domain (no writes). */
function validateRow(row: ImportRow, domain: Domain, seen: Set<string>): ImportResult {
  const errors: string[] = [];
  const raw = (row.address ?? "").trim().toLowerCase();
  let localPart = raw;

  if (!raw) {
    errors.push("Address is required.");
  } else if (raw.includes("@")) {
    const [local, dom] = raw.split("@");
    localPart = local ?? "";
    if (dom !== domain.domainName) errors.push(`Address must be @${domain.domainName}.`);
  }
  if (localPart && !LOCAL_PART.test(localPart)) errors.push("Invalid local part.");
  if (seen.has(localPart)) errors.push("Duplicate address in file.");
  seen.add(localPart);

  if (!row.password) errors.push("Password is required.");
  else {
    const p = assertPasswordPolicy(row.password);
    if (p) errors.push(p);
  }
  if (row.quota && !/^\d+$/.test(row.quota.trim())) errors.push("Quota must be a number of bytes.");

  return { index: 0, address: `${localPart}@${domain.domainName}`, valid: errors.length === 0, errors };
}

/** MBX-005: preview — validate all rows and return per-row error highlights. */
export function previewImport(rows: ImportRow[], domain: Domain): ImportResult[] {
  const seen = new Set<string>();
  return rows.map((row, i) => ({ ...validateRow(row, domain, seen), index: i }));
}

/** MBX-004: commit — create every valid row; invalid rows are reported, not created. */
export async function commitImport(rows: ImportRow[], domain: Domain): Promise<{ created: number; results: ImportResult[] }> {
  const seen = new Set<string>();
  const results: ImportResult[] = [];
  let created = 0;

  // Respect remaining capacity on the domain.
  const existing = await prisma.mailbox.count({ where: { domainId: domain.id } });
  let remaining = domain.maxMailboxes - existing;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const check = { ...validateRow(row, domain, seen), index: i };
    if (!check.valid) {
      results.push(check);
      continue;
    }
    if (remaining <= 0) {
      results.push({ ...check, valid: false, errors: ["Domain mailbox limit reached."] });
      continue;
    }
    const localPart = check.address.split("@")[0]!;
    const dup = await prisma.mailbox.findUnique({ where: { email: check.address } });
    if (dup) {
      results.push({ ...check, valid: false, errors: ["Mailbox already exists."] });
      continue;
    }
    await prisma.mailbox.create({
      data: {
        domainId: domain.id,
        email: check.address,
        localPart,
        displayName: row.displayName,
        password: dovecotPassword(row.password),
        quota: row.quota ? BigInt(row.quota) : undefined,
        maildir: maildirFor(domain.domainName, localPart),
      },
    });
    created++;
    remaining--;
    results.push({ ...check, created: true });
  }

  return { created, results };
}
