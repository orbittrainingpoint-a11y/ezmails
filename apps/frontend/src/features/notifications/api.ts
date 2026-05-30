import { api } from "@/lib/api";

export interface Notification {
  id: string;
  level: "info" | "warning" | "critical";
  message: string;
  acknowledgedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

export const listNotifications = (unreadOnly = false) =>
  api<Notification[]>(`/notifications${unreadOnly ? "?unreadOnly=true" : ""}`);
export const dismissNotification = (id: string) => api<unknown>(`/notifications/${id}/dismiss`, { method: "POST" });
export const ackNotification = (id: string) => api<unknown>(`/notifications/${id}/ack`, { method: "POST" });
