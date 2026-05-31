import { api } from "@/lib/api";
import type { Paged } from "@/features/domains/api";

export interface Mailbox {
  id: string;
  domainId: string;
  email: string;
  localPart: string;
  displayName: string | null;
  quota: string;
  status: "active" | "suspended";
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Alias {
  id: string;
  source: string;
  destination: string;
  isWildcard: boolean;
  isActive: boolean;
}

export interface Forwarder {
  id: string;
  source: string;
  destination: string;
  keepCopy: boolean;
  isActive: boolean;
}

export interface ImportRowResult {
  index: number;
  address: string;
  valid: boolean;
  errors: string[];
  created?: boolean;
}

// ── Mailboxes ──
export const listMailboxes = (domainId: string, params: { search?: string; page?: number } = {}) => {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  return api<Paged<Mailbox>>(`/domains/${domainId}/mailboxes?${q.toString()}`);
};
export const createMailbox = (domainId: string, body: Record<string, unknown>) =>
  api<Mailbox>(`/domains/${domainId}/mailboxes`, { method: "POST", body });
export const updateMailbox = (id: string, body: Record<string, unknown>) =>
  api<Mailbox>(`/mailboxes/${id}`, { method: "PATCH", body });
export const deleteMailbox = (id: string) => api<unknown>(`/mailboxes/${id}`, { method: "DELETE" });
export const resetMailboxPassword = (id: string, password: string) =>
  api<unknown>(`/mailboxes/${id}/reset-password`, { method: "POST", body: { password } });
export const setMailboxSuspended = (id: string, suspended: boolean) =>
  api<Mailbox>(`/mailboxes/${id}/${suspended ? "suspend" : "unsuspend"}`, { method: "POST" });
export const importPreview = (domainId: string, csv: string) =>
  api<ImportRowResult[]>(`/domains/${domainId}/mailboxes/import/preview`, { method: "POST", body: { csv } });
export const importCommit = (domainId: string, csv: string) =>
  api<{ created: number; results: ImportRowResult[] }>(`/domains/${domainId}/mailboxes/import`, {
    method: "POST",
    body: { csv },
  });

// ── Aliases ──
export const listAliases = (domainId: string) => api<Alias[]>(`/domains/${domainId}/aliases`);
export const createAlias = (domainId: string, body: Record<string, unknown>) =>
  api<Alias>(`/domains/${domainId}/aliases`, { method: "POST", body });
export const deleteAlias = (id: string) => api<unknown>(`/aliases/${id}`, { method: "DELETE" });

// ── Forwarders ──
export const listForwarders = (domainId: string) => api<Forwarder[]>(`/domains/${domainId}/forwarders`);
export const createForwarder = (domainId: string, body: Record<string, unknown>) =>
  api<Forwarder>(`/domains/${domainId}/forwarders`, { method: "POST", body });
export const deleteForwarder = (id: string) => api<unknown>(`/forwarders/${id}`, { method: "DELETE" });
