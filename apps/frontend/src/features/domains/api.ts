import { api } from "@/lib/api";

export type DnsStatus = "valid" | "missing" | "incorrect" | "propagating" | "unchecked";

export interface DnsRecord {
  id: string;
  recordType: "MX" | "SPF" | "DKIM" | "DMARC" | "A" | "PTR";
  hostname: string | null;
  expectedValue: string;
  actualValue: string | null;
  status: DnsStatus;
  lastChecked: string | null;
}

export interface DkimKey {
  id: string;
  selector: string;
  isActive: boolean;
  createdAt: string;
  dnsHostname: string;
  dnsValue: string;
}

export interface Domain {
  id: string;
  domainName: string;
  sourceType: "vps_hosted" | "external";
  isActive: boolean;
  webmailEnabled: boolean;
  maxMailboxes: number;
  storageQuota: string;
  sendRate: number;
  catchAll: string | null;
  suspendReason: string | null;
  createdAt: string;
  _count?: { mailboxes: number; aliases: number; forwarders?: number };
  dnsRecords?: DnsRecord[];
  dkimKeys?: { id: string; selector: string; isActive: boolean }[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const listDomains = (params: { search?: string; page?: number } = {}) => {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  return api<Paged<Domain>>(`/domains?${q.toString()}`);
};

export const getDomain = (id: string) => api<Domain>(`/domains/${id}`);

export const createDomain = (body: { domainName: string; sourceType: string }) =>
  api<Domain>("/domains", { method: "POST", body });

export const updateDomain = (id: string, body: Record<string, unknown>) =>
  api<Domain>(`/domains/${id}`, { method: "PATCH", body });

export const suspendDomain = (id: string, reason?: string) =>
  api<Domain>(`/domains/${id}/suspend`, { method: "POST", body: { reason } });

export const unsuspendDomain = (id: string) => api<Domain>(`/domains/${id}/unsuspend`, { method: "POST" });

export const deleteDomain = (id: string) => api<unknown>(`/domains/${id}`, { method: "DELETE" });

export const getDns = (id: string) => api<DnsRecord[]>(`/domains/${id}/dns`);
export const validateDns = (id: string) =>
  api<{ id: string; recordType: string; status: DnsStatus }[]>(`/domains/${id}/dns/validate`, { method: "POST" });

export const getDkim = (id: string) => api<DkimKey[]>(`/domains/${id}/dkim`);
export const rotateDkim = (id: string) => api<DkimKey>(`/domains/${id}/dkim/rotate`, { method: "POST" });
