import { prisma, type Prisma, type MailLogStatus } from "@ezmails/db";
import { env } from "../config/env.js";

export interface LogFilters {
  from?: string;
  to?: string;
  sender?: string;
  recipient?: string;
  status?: MailLogStatus;
  q?: string; // full-text across sender/recipient/detail
  page?: number;
  pageSize?: number;
}

function buildWhere(f: LogFilters): Prisma.MailLogWhereInput {
  const where: Prisma.MailLogWhereInput = {};
  if (f.from || f.to) {
    where.createdAt = {};
    if (f.from) where.createdAt.gte = new Date(f.from);
    if (f.to) where.createdAt.lte = new Date(f.to);
  }
  if (f.sender) where.sender = { contains: f.sender.toLowerCase() };
  if (f.recipient) where.recipient = { contains: f.recipient.toLowerCase() };
  if (f.status) where.status = f.status;
  if (f.q) {
    where.OR = [
      { sender: { contains: f.q, mode: "insensitive" } },
      { recipient: { contains: f.q, mode: "insensitive" } },
      { detail: { contains: f.q, mode: "insensitive" } },
      { queueId: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return where;
}

/** LOG-001/002/003: filtered + full-text log search with paging. */
export async function searchLogs(f: LogFilters) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const where = buildWhere(f);

  const [items, total] = await Promise.all([
    prisma.mailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mailLog.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

/** LOG-006: full delivery trace for a queue ID. */
export async function getTrace(queueId: string) {
  return prisma.mailLog.findMany({ where: { queueId }, orderBy: { createdAt: "asc" } });
}

/** LOG-004: export filtered results as CSV. */
export async function exportCsv(f: LogFilters): Promise<string> {
  const rows = await prisma.mailLog.findMany({ where: buildWhere(f), orderBy: { createdAt: "desc" }, take: 50000 });
  const header = ["timestamp", "queueId", "sender", "recipient", "status", "sizeBytes", "relay", "delayMs", "detail"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.createdAt.toISOString(), r.queueId, r.sender, r.recipient, r.status, r.sizeBytes, r.relay, r.delayMs, r.detail]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/** Ingest a parsed log entry (posted by the per-node log shipper, Phase 12). */
export async function ingestLog(entry: {
  queueId?: string;
  sender: string;
  recipient: string;
  status: MailLogStatus;
  sizeBytes?: number;
  relay?: string;
  delayMs?: number;
  spamScore?: number;
  detail?: string;
  nodeId?: string;
}) {
  return prisma.mailLog.create({ data: entry });
}

/** LOG-005: prune logs older than the retention window (default 90 days). */
export async function pruneOldLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - env.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.mailLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
