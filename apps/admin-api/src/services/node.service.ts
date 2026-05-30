import { prisma, NodeStatus } from "@ezmails/db";
import { Errors } from "../lib/errors.js";
import { nodeAgent } from "../lib/node-agent.js";
import { createNotification } from "./notification.service.js";

/** NODE-001: register a mail node. */
export async function registerNode(input: {
  name: string;
  hostname: string;
  ipAddress: string;
  sshPort?: number;
}) {
  const dup = await prisma.node.findUnique({ where: { hostname: input.hostname } });
  if (dup) throw Errors.conflict("A node with that hostname already exists.");
  return prisma.node.create({ data: input });
}

/** NODE-002: list nodes with live stats + hosted-domain counts. */
export async function listNodes() {
  const nodes = await prisma.node.findMany({
    include: { _count: { select: { domains: true } } },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    nodes.map(async (n) => {
      const res = await nodeAgent.stats(n.hostname);
      return {
        id: n.id,
        name: n.name,
        hostname: n.hostname,
        ipAddress: n.ipAddress,
        status: n.status,
        domains: n._count.domains,
        available: res.available,
        stats: res.available ? res.data : null,
      };
    }),
  );
}

export async function getNodeStats(id: string) {
  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) throw Errors.notFound("Node not found.");
  const res = await nodeAgent.stats(node.hostname);
  return { available: res.available, stats: res.available ? res.data : null };
}

/** NODE-004: decommission a node, migrating its domains to another node first. */
export async function decommissionNode(id: string, migrateToId?: string) {
  const node = await prisma.node.findUnique({ where: { id }, include: { _count: { select: { domains: true } } } });
  if (!node) throw Errors.notFound("Node not found.");

  if (node._count.domains > 0) {
    if (!migrateToId) throw Errors.conflict("Node hosts domains — provide migrateToId to move them first.");
    const target = await prisma.node.findUnique({ where: { id: migrateToId } });
    if (!target) throw Errors.notFound("Target node not found.");
    await prisma.domain.updateMany({ where: { nodeId: id }, data: { nodeId: migrateToId } });
  }
  await prisma.node.delete({ where: { id } });
}

/**
 * NODE-005: poll every node; flip status and raise alerts on offline or >85%
 * resource usage. Invoked by the BullMQ node:health repeatable job.
 */
export async function pollNodeHealth(): Promise<void> {
  const nodes = await prisma.node.findMany();
  for (const n of nodes) {
    const res = await nodeAgent.stats(n.hostname);
    if (!res.available) {
      if (n.status !== NodeStatus.offline) {
        await prisma.node.update({ where: { id: n.id }, data: { status: NodeStatus.offline } });
        await createNotification({
          level: "critical",
          message: `Node ${n.name} is offline.`,
          resourceType: "node",
          resourceId: n.id,
        });
      }
      continue;
    }
    if (n.status === NodeStatus.offline) {
      await prisma.node.update({ where: { id: n.id }, data: { status: NodeStatus.online } });
    }
    const { cpu, ram, disk } = res.data;
    const over = Math.max(cpu, ram, disk);
    if (over >= 85) {
      await createNotification({
        level: "warning",
        message: `Node ${n.name} resource usage at ${Math.round(over)}% (cpu ${cpu}/ram ${ram}/disk ${disk}).`,
        resourceType: "node",
        resourceId: n.id,
      });
    }
  }
}
