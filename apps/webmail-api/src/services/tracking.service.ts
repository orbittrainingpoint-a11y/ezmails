import { prisma } from "@ezmails/db";
import { randomToken } from "../lib/crypto.js";
import { env } from "../config/env.js";

/**
 * Create a tracker and return the HTML with an invisible tracking pixel appended.
 * Returns the original html unchanged if there's nothing to track.
 */
export async function injectTracker(
  mailboxId: string,
  html: string | undefined,
  meta: { subject?: string; recipients?: string[] },
): Promise<string | undefined> {
  if (!html) return html;
  const token = randomToken(24);
  await prisma.emailTracker.create({
    data: {
      mailboxId,
      token,
      subject: meta.subject?.slice(0, 255) || null,
      recipients: (meta.recipients ?? []).join(", ").slice(0, 1024) || null,
    },
  });
  const pixel = `<img src="${env.PUBLIC_BASE_URL}/webmail-api/public/track/email/${token}" width="1" height="1" alt="" style="display:none" />`;
  return `${html}${pixel}`;
}

/** Record an open (called by the public pixel endpoint). */
export async function recordOpen(token: string) {
  await prisma.emailTracker.updateMany({
    where: { token },
    data: { opens: { increment: 1 }, lastOpenAt: new Date() },
  });
}

/** Recent tracked messages for the Tracking settings view. */
export async function listTrackers(mailboxId: string) {
  return prisma.emailTracker.findMany({
    where: { mailboxId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, subject: true, recipients: true, opens: true, lastOpenAt: true, createdAt: true },
  });
}
