import { api } from "@/lib/api";

export interface NodeStat {
  nodeId: string;
  name: string;
  hostname: string;
  status: string;
  available: boolean;
  cpu: number;
  ram: number;
  disk: number;
  queue: number;
  connections: { smtp: number; imap: number };
}

export interface Dashboard {
  counters: {
    delivered: number;
    bounced: number;
    spamBlocked: number;
    queueDepth: number;
    activeConnections: number;
  };
  nodes: NodeStat[];
}

export interface VolumePoint {
  day: string;
  delivered: number;
  bounced: number;
  spam: number;
}

export interface TopDomains {
  byVolume: { domain: string; total: number }[];
  byBounce: { domain: string; rate: number }[];
}

export const getDashboard = () => api<Dashboard>("/dashboard");
export const getVolume = () => api<VolumePoint[]>("/dashboard/volume");
export const getTopDomains = () => api<TopDomains>("/dashboard/top-domains");
