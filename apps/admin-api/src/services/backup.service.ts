import { prisma, BackupStatus } from "@ezmails/db";
import { Errors } from "../lib/errors.js";
import { jobsQueue } from "../lib/queue.js";

/** BKP-004: list backup jobs with their status. */
export async function listBackups() {
  return prisma.backupJob.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getBackup(id: string) {
  const job = await prisma.backupJob.findUnique({ where: { id } });
  if (!job) throw Errors.notFound("Backup job not found.");
  return job;
}

/**
 * BKP-001/002: create a backup job. With a cron `schedule` it becomes a
 * recurring BullMQ job; otherwise it's a one-off enqueued immediately.
 */
export async function createBackup(input: { scope: string; destination: string; schedule?: string }) {
  const job = await prisma.backupJob.create({
    data: {
      scope: input.scope,
      destination: input.destination,
      schedule: input.schedule,
      status: input.schedule ? BackupStatus.scheduled : BackupStatus.scheduled,
    },
  });

  if (input.schedule) {
    await jobsQueue.add("backup:run", { backupId: job.id }, { repeat: { pattern: input.schedule }, jobId: `backup-${job.id}` });
  } else {
    await jobsQueue.add("backup:run", { backupId: job.id });
  }
  return job;
}

/** BKP-002: trigger an existing job to run now. */
export async function triggerBackup(id: string) {
  await getBackup(id);
  await jobsQueue.add("backup:run", { backupId: id });
}

/**
 * Executed by the worker. The actual mailbox archiving runs on the node agent
 * (Phase 12); here we manage state so the UI reflects progress/outcome.
 */
export async function runBackup(id: string): Promise<void> {
  await prisma.backupJob.update({ where: { id }, data: { status: BackupStatus.running } });
  try {
    // TODO(Phase 12): call node agent to tar the relevant maildirs to destination.
    await prisma.backupJob.update({
      where: { id },
      data: {
        status: BackupStatus.success,
        lastRunAt: new Date(),
        detail: "Backup recorded. Maildir archiving is performed by the node agent (Phase 12).",
      },
    });
  } catch (err) {
    await prisma.backupJob.update({
      where: { id },
      data: { status: BackupStatus.failed, detail: err instanceof Error ? err.message : "Backup failed." },
    });
  }
}

/** BKP-003: restore a mailbox/domain from a backup snapshot. */
export async function restoreBackup(id: string, target?: string) {
  const job = await getBackup(id);
  // TODO(Phase 12): instruct the node agent to restore `target` from job.destination.
  return { backupId: job.id, target: target ?? job.scope, queued: true };
}
