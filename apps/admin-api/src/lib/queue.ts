import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { env } from "../config/env.js";

// BullMQ requires a dedicated connection with retry disabled.
const connection: ConnectionOptions = (() => {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
})();

// NOTE: BullMQ disallows ":" in queue names (it's used as an internal key separator).
export const JOBS_QUEUE = "ezmails-jobs";

export const jobsQueue = new Queue(JOBS_QUEUE, { connection });

/** Register repeatable maintenance jobs (idempotent — keyed by jobId pattern). */
export async function scheduleRepeatableJobs(): Promise<void> {
  // DOM-006: re-validate DNS for all domains every 15 minutes.
  await jobsQueue.add("dns:revalidate", {}, { repeat: { every: 15 * 60 * 1000 }, jobId: "dns-revalidate" });
  // NODE-005: poll node health every minute.
  await jobsQueue.add("node:health", {}, { repeat: { every: 60 * 1000 }, jobId: "node-health" });
  // LOG-005: prune mail logs past the retention window daily.
  await jobsQueue.add("log:retention", {}, { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "log-retention" });
}

export function createWorker(processor: ConstructorParameters<typeof Worker>[1]): Worker {
  return new Worker(JOBS_QUEUE, processor, { connection });
}

export { connection as bullConnection };
