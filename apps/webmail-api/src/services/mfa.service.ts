import { prisma, type Prisma } from "@ezmails/db";
import { randomInt } from "node:crypto";
import { sendSystemMail } from "../lib/systemmail.js";

export const genOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

async function readPrefs(mailboxId: string): Promise<Record<string, unknown>> {
  const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
  return (s?.prefs as Record<string, unknown> | null) ?? {};
}

async function writePrefs(mailboxId: string, patch: Record<string, unknown>): Promise<void> {
  const prefs = await readPrefs(mailboxId);
  const next = { ...prefs, ...patch } as unknown as Prisma.InputJsonValue;
  await prisma.webmailSettings.upsert({ where: { mailboxId }, create: { mailboxId, prefs: next }, update: { prefs: next } });
}

export async function getRecoveryEmail(mailboxId: string): Promise<string | null> {
  return ((await readPrefs(mailboxId)).recoveryEmail as string | undefined) ?? null;
}
export async function setRecoveryEmail(mailboxId: string, email: string): Promise<void> {
  await writePrefs(mailboxId, { recoveryEmail: email.toLowerCase() });
}
export async function isEmailOtpEnabled(mailboxId: string): Promise<boolean> {
  return !!(await readPrefs(mailboxId)).emailOtpEnabled;
}
export async function setEmailOtpEnabled(mailboxId: string, on: boolean): Promise<void> {
  await writePrefs(mailboxId, { emailOtpEnabled: on });
}

/** Mask an address for display: john@example.com → j•••@example.com */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user[0]}${"•".repeat(Math.max(1, user.length - 1))}@${domain}`;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await sendSystemMail(
    to,
    "Your Infinit Email verification code",
    `Your verification code is ${code}. It expires in 5 minutes. If you didn't request this, ignore this email.`,
    `<div style="font-family:system-ui,sans-serif">
       <p>Your verification code is:</p>
       <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
       <p style="color:#666">It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
     </div>`,
  );
}
