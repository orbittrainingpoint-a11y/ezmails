import { api } from "@/lib/api";
import type { Paged } from "@/features/domains/api";

// ── Queue ──
export interface QueueItem {
  queueId: string;
  sender: string;
  recipient: string;
  arrivalTime: string;
  reason: string;
  sizeBytes: number;
  nodeId: string;
  nodeName: string;
}
export const getQueue = (params: { senderDomain?: string; recipientDomain?: string; reason?: string } = {}) => {
  const q = new URLSearchParams(params as Record<string, string>);
  return api<{ items: QueueItem[]; depth: number; unavailableNodes: string[] }>(`/queue?${q}`);
};
export const retryQueue = (queueId: string, nodeId: string) =>
  api<unknown>(`/queue/${encodeURIComponent(queueId)}/retry`, { method: "POST", body: { nodeId } });
export const deleteQueue = (queueId: string, nodeId: string) =>
  api<unknown>(`/queue/${encodeURIComponent(queueId)}`, { method: "DELETE", body: { nodeId } });
export const flushQueue = (nodeId?: string) => api<unknown>("/queue/flush", { method: "POST", body: { nodeId } });

// ── Logs ──
export interface MailLogEntry {
  id: string;
  queueId: string | null;
  sender: string;
  recipient: string;
  status: "delivered" | "bounced" | "deferred" | "rejected";
  sizeBytes: number | null;
  relay: string | null;
  delayMs: number | null;
  detail: string | null;
  createdAt: string;
}
export interface LogFilters {
  from?: string;
  to?: string;
  sender?: string;
  recipient?: string;
  status?: string;
  q?: string;
  page?: number;
}
export const searchLogs = (f: LogFilters) => {
  const q = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => v && q.set(k, String(v)));
  return api<Paged<MailLogEntry>>(`/logs?${q}`);
};
export const getTrace = (queueId: string) => api<MailLogEntry[]>(`/logs/${encodeURIComponent(queueId)}`);
export const exportLogsUrl = (f: LogFilters) => {
  const q = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => v && q.set(k, String(v)));
  return api<string>(`/logs/export?${q}`);
};

// ── Nodes ──
export interface NodeRow {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  status: string;
  domains: number;
  available: boolean;
  stats: { cpu: number; ram: number; disk: number; queue: number } | null;
}
export const listNodes = () => api<NodeRow[]>("/nodes");
export const registerNode = (body: Record<string, unknown>) => api<NodeRow>("/nodes", { method: "POST", body });
export const decommissionNode = (id: string, migrateToId?: string) =>
  api<unknown>(`/nodes/${id}`, { method: "DELETE", body: { migrateToId } });

// ── Spam ──
export interface Thresholds {
  tag: number;
  greylist: number;
  reject: number;
}
export interface AccessRule {
  id: string;
  domainId: string | null;
  action: "allow" | "deny";
  kind: "ip" | "domain";
  value: string;
  note: string | null;
}
export const getThresholds = () => api<Thresholds>("/spam/thresholds");
export const setThresholds = (body: Thresholds) => api<Thresholds>("/spam/thresholds", { method: "PUT", body });
export const listAccessRules = () => api<AccessRule[]>("/spam/access-rules");
export const createAccessRule = (body: Record<string, unknown>) =>
  api<AccessRule>("/spam/access-rules", { method: "POST", body });
export const deleteAccessRule = (id: string) => api<unknown>(`/spam/access-rules/${id}`, { method: "DELETE" });
export const getScoreDistribution = () => api<{ bucket: number; count: number }[]>("/spam/score-distribution");
