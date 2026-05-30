import { api } from "@/lib/api";

export interface Tenant {
  id: string;
  email: string;
  displayName: string | null;
  role: "super_admin" | "reseller" | "customer";
  parentId: string | null;
  isActive: boolean;
  maxCustomers: number | null;
  maxDomains: number | null;
  storagePool: string | null;
  createdAt: string;
}

export interface Usage {
  domains: number;
  mailboxes: number;
  storageAllocated: string;
  messagesSent: number;
  messagesReceived: number;
}

// Customers
export const listCustomers = () => api<Tenant[]>("/customers");
export const createCustomer = (body: Record<string, unknown>) => api<Tenant>("/customers", { method: "POST", body });
export const getCustomerUsage = (id: string) => api<Usage>(`/customers/${id}/usage`);
export const setCustomerSuspended = (id: string, suspended: boolean) =>
  api<Tenant>(`/customers/${id}/${suspended ? "suspend" : "reactivate"}`, { method: "POST" });
export const deleteCustomer = (id: string) => api<unknown>(`/customers/${id}`, { method: "DELETE" });
export const promoteCustomer = (id: string, body: Record<string, unknown>) =>
  api<Tenant>(`/customers/${id}/promote`, { method: "POST", body });

// Resellers
export const listResellers = () => api<Tenant[]>("/resellers");
export const createReseller = (body: Record<string, unknown>) => api<Tenant>("/resellers", { method: "POST", body });
export const getResellerUsage = (id: string) => api<Usage>(`/resellers/${id}/usage`);
export const updateReseller = (id: string, body: Record<string, unknown>) =>
  api<Tenant>(`/resellers/${id}`, { method: "PATCH", body });
