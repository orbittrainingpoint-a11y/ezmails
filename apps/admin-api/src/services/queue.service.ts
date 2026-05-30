import { prisma } from "@ezmails/db";
import { Errors } from "../lib/errors.js";
import { nodeAgent, type QueuedMessage } from "../lib/node-agent.js";

interface QueueItem extends QueuedMessage {
  nodeId: string;
  nodeName: string;
}

/** QUEUE-001/005: aggregate queued messages across all nodes, with filters. */
export async function listQueue(filters: { senderDomain?: string; recipientDomain?: string; reason?: string }) {
  const nodes = await prisma.node.findMany();
  const items: QueueItem[] = [];
  const unavailable: string[] = [];

  await Promise.all(
    nodes.map(async (n) => {
      const res = await nodeAgent.queue(n.hostname);
      if (!res.available) {
        unavailable.push(n.name);
        return;
      }
      for (const m of res.data) items.push({ ...m, nodeId: n.id, nodeName: n.name });
    }),
  );

  const filtered = items.filter((m) => {
    if (filters.senderDomain && !m.sender.toLowerCase().endsWith(`@${filters.senderDomain.toLowerCase()}`)) return false;
    if (filters.recipientDomain && !m.recipient.toLowerCase().endsWith(`@${filters.recipientDomain.toLowerCase()}`)) return false;
    if (filters.reason && !m.reason.toLowerCase().includes(filters.reason.toLowerCase())) return false;
    return true;
  });

  return { items: filtered, depth: filtered.length, unavailableNodes: unavailable };
}

async function hostFor(nodeId: string): Promise<string> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) throw Errors.notFound("Node not found.");
  return node.hostname;
}

/** QUEUE-002: retry a single queued message. */
export async function retryMessage(nodeId: string, queueId: string) {
  const res = await nodeAgent.retry(await hostFor(nodeId), queueId);
  if (!res.available) throw Errors.notFound("Node agent unavailable.");
  return res.data;
}

/** QUEUE-004: delete a single queued message. */
export async function deleteMessage(nodeId: string, queueId: string) {
  const res = await nodeAgent.remove(await hostFor(nodeId), queueId);
  if (!res.available) throw Errors.notFound("Node agent unavailable.");
  return res.data;
}

/** QUEUE-003: flush the queue (retry all) on one node or every node. */
export async function flushQueue(nodeId?: string) {
  const nodes = nodeId
    ? [await prisma.node.findUniqueOrThrow({ where: { id: nodeId } })]
    : await prisma.node.findMany();
  const results = await Promise.all(
    nodes.map(async (n) => ({ node: n.name, result: await nodeAgent.flush(n.hostname) })),
  );
  return results;
}
