import { env } from "../config/env.js";

/**
 * Thin HTTP client for a mail node's agent. The agent (a small sidecar shipped
 * with the Postfix/Dovecot images in Phase 12) exposes queue control and host
 * stats over the internal network. Until an agent is reachable, every call
 * degrades gracefully to `{ available: false }` so the panel still renders.
 */
export interface NodeStats {
  cpu: number; // %
  ram: number; // %
  disk: number; // %
  queue: number; // current Postfix queue depth
  connections: { smtp: number; imap: number };
}

export interface QueuedMessage {
  queueId: string;
  sender: string;
  recipient: string;
  arrivalTime: string;
  reason: string;
  sizeBytes: number;
}

type AgentResult<T> = { available: true; data: T } | { available: false; error: string };

async function agentFetch<T>(host: string, path: string, init?: RequestInit): Promise<AgentResult<T>> {
  const url = `http://${host}:${env.NODE_AGENT_PORT}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(env.INTERNAL_TOKEN ? { "x-internal-token": env.INTERNAL_TOKEN } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return { available: false, error: `agent ${res.status}` };
    return { available: true, data: (await res.json()) as T };
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

export const nodeAgent = {
  stats: (host: string) => agentFetch<NodeStats>(host, "/stats"),
  queue: (host: string) => agentFetch<QueuedMessage[]>(host, "/queue"),
  retry: (host: string, queueId: string) =>
    agentFetch<{ ok: boolean }>(host, `/queue/${encodeURIComponent(queueId)}/retry`, { method: "POST" }),
  remove: (host: string, queueId: string) =>
    agentFetch<{ ok: boolean }>(host, `/queue/${encodeURIComponent(queueId)}`, { method: "DELETE" }),
  flush: (host: string) => agentFetch<{ ok: boolean }>(host, "/queue/flush", { method: "POST" }),
  quarantine: (host: string) => agentFetch<QueuedMessage[]>(host, "/quarantine"),
  quarantineRelease: (host: string, id: string) =>
    agentFetch<{ ok: boolean }>(host, `/quarantine/${encodeURIComponent(id)}/release`, { method: "POST" }),
  quarantineDelete: (host: string, id: string) =>
    agentFetch<{ ok: boolean }>(host, `/quarantine/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
