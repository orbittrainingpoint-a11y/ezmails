import { prisma } from "@ezmails/db";
import { createWorker, scheduleRepeatableJobs } from "../lib/queue.js";
import { validateDomainDns } from "../services/dns.service.js";
import { pollNodeHealth } from "../services/node.service.js";
import { pruneOldLogs } from "../services/log.service.js";
import { getDashboard } from "../services/dashboard.service.js";
import { runBackup } from "../services/backup.service.js";
import { broadcast } from "../lib/ws-hub.js";

let metricsTimer: NodeJS.Timeout | null = null;

/** Start BullMQ worker + repeatable jobs + the 30s dashboard metrics broadcast. */
export async function startWorkers(logger: { info: (m: string) => void; error: (e: unknown) => void }): Promise<void> {
  const worker = createWorker(async (job) => {
    switch (job.name) {
      case "dns:revalidate": {
        const domains = await prisma.domain.findMany({ where: { isActive: true }, select: { id: true } });
        for (const d of domains) await validateDomainDns(d.id).catch(() => {});
        return { checked: domains.length };
      }
      case "node:health":
        await pollNodeHealth();
        return { ok: true };
      case "log:retention": {
        const removed = await pruneOldLogs();
        return { removed };
      }
      case "backup:run": {
        await runBackup((job.data as { backupId: string }).backupId);
        return { ok: true };
      }
      default:
        return { skipped: job.name };
    }
  });

  worker.on("failed", (job, err) => logger.error(`job ${job?.name} failed: ${err.message}`));
  await scheduleRepeatableJobs();

  // DASH-003: push fresh dashboard metrics to WS clients every 30 seconds.
  metricsTimer = setInterval(() => {
    void getDashboard()
      .then((d) => broadcast({ event: "node:stats", data: d }))
      .catch(() => {});
  }, 30_000);

  logger.info("Background workers started (DNS revalidate, node health, log retention, metrics).");
}

export function stopMetricsTimer(): void {
  if (metricsTimer) clearInterval(metricsTimer);
}
