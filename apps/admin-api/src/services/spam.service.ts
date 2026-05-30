import { prisma, type AccessAction, type AccessKind } from "@ezmails/db";
import { Errors } from "../lib/errors.js";
import { getSpamThresholds, setSetting, SettingKeys, type SpamThresholds } from "../lib/settings.js";
import { nodeAgent } from "../lib/node-agent.js";

/** SPAM-002: read/update the global Rspamd score thresholds. */
export async function getThresholds(): Promise<SpamThresholds> {
  return getSpamThresholds();
}

export async function setThresholds(value: SpamThresholds): Promise<SpamThresholds> {
  await setSetting(SettingKeys.spamThresholds, value);
  return value;
}

/** SPAM-005: allow/deny list management (global or per-domain). */
export async function listAccessRules(domainId?: string | null) {
  return prisma.accessRule.findMany({
    where: domainId === undefined ? {} : { domainId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAccessRule(input: {
  domainId?: string | null;
  action: AccessAction;
  kind: AccessKind;
  value: string;
  note?: string;
}) {
  return prisma.accessRule.create({
    data: {
      domainId: input.domainId ?? null,
      action: input.action,
      kind: input.kind,
      value: input.value.trim().toLowerCase(),
      note: input.note,
    },
  });
}

export async function deleteAccessRule(id: string) {
  await prisma.accessRule.delete({ where: { id } });
}

/** SPAM-001: spam-score distribution over the last 24 hours (bucketed). */
export async function getScoreDistribution() {
  const rows = await prisma.$queryRaw<{ bucket: number; count: bigint }[]>`
    SELECT width_bucket(spam_score, 0, 20, 20) AS bucket, count(*) AS count
    FROM mail_log
    WHERE spam_score IS NOT NULL AND created_at >= now() - interval '24 hours'
    GROUP BY 1 ORDER BY 1
  `;
  return rows.map((r) => ({ bucket: Number(r.bucket), count: Number(r.count) }));
}

/** SPAM-003: view / release / delete quarantined messages on a node. */
export async function listQuarantine(nodeId: string) {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) throw Errors.notFound("Node not found.");
  const res = await nodeAgent.quarantine(node.hostname);
  return { available: res.available, items: res.available ? res.data : [] };
}

export async function releaseQuarantine(nodeId: string, id: string) {
  const node = await prisma.node.findUniqueOrThrow({ where: { id: nodeId } });
  const res = await nodeAgent.quarantineRelease(node.hostname, id);
  if (!res.available) throw Errors.notFound("Node agent unavailable.");
  return res.data;
}

export async function deleteQuarantine(nodeId: string, id: string) {
  const node = await prisma.node.findUniqueOrThrow({ where: { id: nodeId } });
  const res = await nodeAgent.quarantineDelete(node.hostname, id);
  if (!res.available) throw Errors.notFound("Node agent unavailable.");
  return res.data;
}
