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

export type DeliveryTestStatus =
  | "passed"
  | "failed"
  | "unexpected_response"
  | "timeout"
  | null;

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
  lastDeliveryTestAt?: string | null;
  lastDeliveryTestStatus?: DeliveryTestStatus;
  lastDeliveryTestDetail?: string | null;
  _count?: { mailboxes: number; aliases: number; forwarders?: number };
  dnsRecords?: DnsRecord[];
  dkimKeys?: { id: string; selector: string; isActive: boolean }[];
}

/** Aggregate DNS health for a domain, derived client-side from its dnsRecords. */
export function domainHealth(domain: Pick<Domain, "dnsRecords">): "healthy" | "attention" | "propagating" | "unknown" {
  const records = domain.dnsRecords;
  if (!records || records.length === 0) return "unknown";
  if (records.some((r) => r.status === "missing" || r.status === "incorrect")) return "attention";
  if (records.some((r) => r.status === "propagating" || r.status === "unchecked")) return "propagating";
  return "healthy";
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
export const sendDnsInstructions = (id: string, email: string, note?: string) =>
  api<unknown>(`/domains/${id}/dns/send`, { method: "POST", body: { email, note } });

export const getDkim = (id: string) => api<DkimKey[]>(`/domains/${id}/dkim`);
export const rotateDkim = (id: string) => api<DkimKey>(`/domains/${id}/dkim/rotate`, { method: "POST" });

// ── Live delivery test (DOM-020) ──
export const testDelivery = (id: string, mailboxId: string) =>
  api<{ started: boolean }>(`/domains/${id}/dns/test-delivery`, { method: "POST", body: { mailboxId } });

// ── Registrar auto-provisioning (DOM-021) ──
export interface NamecheapHost {
  hostId?: string;
  name: string;
  type: string;
  address: string;
  mxPref?: number;
  ttl?: number;
}
export interface DnsSyncDiff {
  domainId: string;
  domainName: string;
  toAdd: NamecheapHost[];
  toUpdate: { before: NamecheapHost; after: NamecheapHost }[];
  unchanged: NamecheapHost[];
  preserved: NamecheapHost[];
  mergedHosts: NamecheapHost[];
}

export const detectRegistrar = (id: string) =>
  api<{ registrar: "namecheap" | null }>(`/domains/${id}/dns/registrar-detect`);
export const previewRegistrarSync = (id: string) => api<DnsSyncDiff>(`/domains/${id}/dns/registrar-preview`);
export const applyRegistrarSync = (id: string) =>
  api<{ auditLogId: string }>(`/domains/${id}/dns/registrar-apply`, { method: "POST" });
export const rollbackRegistrarSync = (id: string, snapshotId: string) =>
  api<unknown>(`/domains/${id}/dns/registrar-rollback`, { method: "POST", body: { snapshotId } });
