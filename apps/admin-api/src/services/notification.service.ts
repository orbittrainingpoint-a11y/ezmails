import { prisma, type NotificationLevel } from "@ezmails/db";
import { broadcast } from "../lib/ws-hub.js";
import { getSetting, setSetting } from "../lib/settings.js";

/**
 * Create an in-app notification and push it to connected admins in real time.
 * userId null = broadcast to all admins. (List/ack/dismiss land in Phase 5.)
 */
export async function createNotification(input: {
  userId?: string | null;
  level: NotificationLevel;
  message: string;
  resourceType?: string;
  resourceId?: string;
}): Promise<void> {
  const notif = await prisma.notification.create({
    data: {
      userId: input.userId ?? null,
      level: input.level,
      message: input.message,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    },
  });
  await broadcast({
    event: "alert",
    data: {
      id: notif.id,
      level: notif.level,
      message: notif.message,
      timestamp: notif.createdAt.toISOString(),
    },
  });
}

/** NOTIF-003: list a user's notifications (their own + broadcasts), newest first. */
export async function listNotifications(userId: string, opts: { unreadOnly?: boolean } = {}) {
  return prisma.notification.findMany({
    where: {
      OR: [{ userId }, { userId: null }],
      ...(opts.unreadOnly ? { dismissedAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function acknowledgeNotification(id: string) {
  return prisma.notification.update({ where: { id }, data: { acknowledgedAt: new Date() } });
}

export async function dismissNotification(id: string) {
  return prisma.notification.update({ where: { id }, data: { dismissedAt: new Date() } });
}

const EMAIL_ALERTS_KEY = "notify.email";

export interface EmailAlertSettings {
  enabled: boolean;
  address: string | null;
}

/** NOTIF-002: external email address for critical alerts. */
export async function getEmailAlertSettings(): Promise<EmailAlertSettings> {
  return getSetting<EmailAlertSettings>(EMAIL_ALERTS_KEY, { enabled: false, address: null });
}

export async function setEmailAlertSettings(value: EmailAlertSettings): Promise<EmailAlertSettings> {
  await setSetting(EMAIL_ALERTS_KEY, value);
  return value;
}
