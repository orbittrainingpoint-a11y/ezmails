import { api } from "@/lib/api";

export interface TotpSetup {
  otpauth: string;
  qrDataUrl: string;
  recoveryCodes: string[];
}
export const totpSetup = () => api<TotpSetup>("/auth/totp/setup", { method: "POST" });
export const totpVerify = (code: string) => api<{ totpEnabled: boolean }>("/auth/totp/verify", { method: "POST", body: { code } });

export interface ApiToken {
  id: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
export const listTokens = () => api<ApiToken[]>("/api-tokens");
export const createToken = (name: string) => api<ApiToken & { token: string }>("/api-tokens", { method: "POST", body: { name } });
export const revokeToken = (id: string) => api<unknown>(`/api-tokens/${id}`, { method: "DELETE" });

export interface EmailAlerts {
  enabled: boolean;
  address: string | null;
}
export const getEmailAlerts = () => api<EmailAlerts>("/notifications/settings/email");
export const setEmailAlerts = (body: EmailAlerts) => api<EmailAlerts>("/notifications/settings/email", { method: "PUT", body });
