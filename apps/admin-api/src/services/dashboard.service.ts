import { prisma } from "@ezmails/db";
import { nodeAgent } from "../lib/node-agent.js";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** DASH-001/002: top-line counters plus live node resource gauges. */
export async function getDashboard() {
  const since = startOfToday();

  const [delivered, bounced, spamBlocked, nodes] = await Promise.all([
    prisma.mailLog.count({ where: { status: "delivered", createdAt: { gte: since } } }),
    prisma.mailLog.count({ where: { status: "bounced", createdAt: { gte: since } } }),
    prisma.mailLog.count({ where: { status: "rejected", createdAt: { gte: since } } }),
    prisma.node.findMany(),
  ]);

  // Live per-node stats (DASH-002) — degrade gracefully if an agent is down.
  const nodeStats = await Promise.all(
    nodes.map(async (n) => {
      const res = await nodeAgent.stats(n.hostname);
      return {
        nodeId: n.id,
        name: n.name,
        hostname: n.hostname,
        status: n.status,
        available: res.available,
        ...(res.available ? res.data : { cpu: 0, ram: 0, disk: 0, queue: 0, connections: { smtp: 0, imap: 0 } }),
      };
    }),
  );

  const queueDepth = nodeStats.reduce((sum, n) => sum + (n.queue ?? 0), 0);
  const activeConnections = nodeStats.reduce(
    (sum, n) => sum + (n.connections?.smtp ?? 0) + (n.connections?.imap ?? 0),
    0,
  );

  return {
    counters: { delivered, bounced, spamBlocked, queueDepth, activeConnections },
    nodes: nodeStats,
  };
}

interface VolumePoint {
  day: string;
  delivered: number;
  bounced: number;
  spam: number;
}

/** DASH-004: 7-day email volume series. */
export async function getVolumeSeries(): Promise<VolumePoint[]> {
  const rows = await prisma.$queryRaw<
    { day: Date; status: string; count: bigint }[]
  >`
    SELECT date_trunc('day', created_at) AS day, status, count(*) AS count
    FROM mail_log
    WHERE created_at >= now() - interval '7 days'
    GROUP BY 1, 2
    ORDER BY 1
  `;

  const byDay = new Map<string, VolumePoint>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10);
    const point = byDay.get(key) ?? { day: key, delivered: 0, bounced: 0, spam: 0 };
    const n = Number(r.count);
    if (r.status === "delivered") point.delivered += n;
    else if (r.status === "bounced") point.bounced += n;
    else if (r.status === "rejected") point.spam += n;
    byDay.set(key, point);
  }
  return [...byDay.values()];
}

/** DASH-005: top 5 domains by volume and by bounce rate. */
export async function getTopDomains() {
  const byVolume = await prisma.$queryRaw<{ domain: string; total: bigint }[]>`
    SELECT split_part(recipient, '@', 2) AS domain, count(*) AS total
    FROM mail_log
    WHERE created_at >= now() - interval '7 days'
    GROUP BY 1 ORDER BY total DESC LIMIT 5
  `;

  const byBounce = await prisma.$queryRaw<{ domain: string; rate: number }[]>`
    SELECT split_part(recipient, '@', 2) AS domain,
           round(100.0 * sum(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) / count(*), 2) AS rate
    FROM mail_log
    WHERE created_at >= now() - interval '7 days'
    GROUP BY 1 HAVING count(*) > 0 ORDER BY rate DESC LIMIT 5
  `;

  return {
    byVolume: byVolume.map((r) => ({ domain: r.domain, total: Number(r.total) })),
    byBounce: byBounce.map((r) => ({ domain: r.domain, rate: Number(r.rate) })),
  };
}
