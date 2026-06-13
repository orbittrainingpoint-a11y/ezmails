import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@ezmails/db";
import { verifyImapLogin } from "../lib/imap.js";
import { createSession, destroySession, hashToken, listSessions, revokeSession, revokeOtherSessions } from "../lib/session.js";
import { redis } from "../lib/redis.js";
import { encrypt, decrypt, randomToken, sha256 } from "../lib/crypto.js";
import { env } from "../config/env.js";
import { Errors, AppError } from "../lib/errors.js";
import { hitLimit, isLockedOut, recordFailure, clearFailures } from "../lib/ratelimit.js";
import { WEBMAIL_COOKIE } from "../plugins/auth.js";
import { isTotpEnabled, verifyLoginCode, setupTotp, verifyAndEnable, disableTotp } from "../services/totp.service.js";
import { genOtp, getRecoveryEmail, setRecoveryEmail, isEmailOtpEnabled, setEmailOtpEnabled, sendOtpEmail, maskEmail } from "../services/mfa.service.js";
import { onLogin, recordEvent, listEvents } from "../services/security.service.js";
import {
  listPasskeys, hasPasskeys, getRegistrationOptions, verifyRegistration, deletePasskey,
  getAuthenticationOptions, verifyAuthentication,
} from "../services/passkey.service.js";

const otpSetupKey = (mailboxId: string) => `webmail:emailotp:setup:${mailboxId}`;

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const mfaKey = (token: string) => `webmail:mfa:${sha256(token)}`;
const SECURE_COOKIE = env.NODE_ENV === "production";

/** Verify the mailbox password — over IMAP, or against the DB hash in dev. */
async function verifyPassword(mailbox: { password: string }, email: string, password: string): Promise<boolean> {
  if (env.WEBMAIL_DEV_BYPASS_IMAP) {
    return bcrypt.compare(password, mailbox.password.replace(/^\{[^}]+\}/, ""));
  }
  return verifyImapLogin(email, password);
}

async function issueSession(req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply, mailbox: { id: string; email: string; displayName: string | null }, email: string, password: string) {
  await prisma.mailbox.update({ where: { id: mailbox.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
  const token = await createSession(mailbox.id, email.toLowerCase(), password, { ip: req.ip, ua: req.headers["user-agent"] });
  reply.setCookie(WEBMAIL_COOKIE, token, { httpOnly: true, secure: SECURE_COOKIE, sameSite: "lax", path: "/" });
  void onLogin(mailbox.id, mailbox.email, req.ip, req.headers["user-agent"]).catch(() => {}); // log + new-device alert
  return { token, profile: { email: mailbox.email, displayName: mailbox.displayName } };
}

/** Hash of the token authenticating this request — identifies the current session. */
function currentSessionHash(req: import("fastify").FastifyRequest): string {
  const token = req.cookies?.[WEBMAIL_COOKIE] ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return token ? hashToken(token) : "";
}

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const emailKey = email.toLowerCase();

    // Per-IP flood protection (covers credential stuffing across many accounts).
    const ipLimit = await hitLimit(`login:ip:${req.ip}`, 30, 300);
    if (!ipLimit.ok) throw new AppError(429, "RATE_LIMITED", `Too many attempts. Try again in ${Math.ceil(ipLimit.retryAfter / 60)} min.`);

    // Per-account lockout after repeated wrong passwords.
    const lock = await isLockedOut(`login:${emailKey}`, 6);
    if (lock.locked) throw new AppError(429, "ACCOUNT_LOCKED", `Too many failed sign-ins for this account. Try again in ${Math.ceil(lock.retryAfter / 60)} min.`);

    const mailbox = await prisma.mailbox.findUnique({ where: { email: emailKey } });
    const valid = !!mailbox && mailbox.status === "active" && (await verifyPassword(mailbox, email, password));
    if (!mailbox || !valid) {
      await recordFailure(`login:${emailKey}`, 900); // 15-min lock window
      throw Errors.invalidCredentials();
    }
    await clearFailures(`login:${emailKey}`);

    // Webmail 2FA gate — passkey (WebAuthn), authenticator (TOTP), or an emailed code.
    // These tolerate failures (e.g. a not-yet-migrated table) by degrading to "no 2FA"
    // rather than 500-ing the login for everyone.
    const passkey = await hasPasskeys(mailbox.id).catch(() => false);
    const totp = await isTotpEnabled(mailbox.id).catch(() => false);
    const emailOtp = await isEmailOtpEnabled(mailbox.id).catch(() => false);
    if (passkey || totp || emailOtp) {
      const methods: string[] = [];
      if (passkey) methods.push("passkey");
      if (totp) methods.push("totp");
      if (emailOtp) methods.push("email");
      const primary = methods[0]!;
      const mfaToken = randomToken(24);

      let otp: string | undefined;
      let hint: string | undefined;
      let passkeyChallenge: string | undefined;
      let passkeyOptions: unknown;
      if (passkey) {
        passkeyOptions = await getAuthenticationOptions(mailbox.id);
        passkeyChallenge = (passkeyOptions as { challenge?: string } | null)?.challenge;
      }
      if (emailOtp) hint = maskEmail((await getRecoveryEmail(mailbox.id)) ?? "");
      // Pre-send the email code only if it's the only/primary factor (avoid emailing on every passkey login).
      if (primary === "email") {
        const rec = await getRecoveryEmail(mailbox.id);
        if (rec) { otp = genOtp(); await sendOtpEmail(rec, otp).catch(() => {}); }
      }
      await redis.set(mfaKey(mfaToken), JSON.stringify({ mailboxId: mailbox.id, email: emailKey, p: encrypt(password), methods, otp, passkeyChallenge }), "EX", 300);
      return reply.send({ success: true, data: { mfaRequired: true, mfaToken, method: primary, methods, hint, passkeyOptions } });
    }

    return reply.send({ success: true, data: await issueSession(req, reply, mailbox, email, password) });
  });

  // Send (or re-send) an email OTP during a multi-method MFA challenge.
  app.post("/auth/mfa/send-email-code", async (req, reply) => {
    const { mfaToken } = z.object({ mfaToken: z.string() }).parse(req.body);
    const raw = await redis.get(mfaKey(mfaToken));
    if (!raw) throw Errors.unauthorized("Challenge expired. Please sign in again.");
    const payload = JSON.parse(raw) as { mailboxId: string; methods?: string[] };
    if (!payload.methods?.includes("email")) throw new AppError(400, "NO_EMAIL_2FA", "Email codes aren't enabled.");
    const rec = await getRecoveryEmail(payload.mailboxId);
    if (!rec) throw new AppError(400, "NO_RECOVERY_EMAIL", "No recovery email on file.");
    const otp = genOtp();
    await sendOtpEmail(rec, otp).catch(() => {});
    await redis.set(mfaKey(mfaToken), JSON.stringify({ ...payload, otp }), "EX", 300);
    return reply.send({ success: true, data: { sent: true, hint: maskEmail(rec) } });
  });

  app.post("/auth/mfa", async (req, reply) => {
    const { mfaToken, code, passkey } = z.object({
      mfaToken: z.string(),
      code: z.string().optional(),
      passkey: z.any().optional(),
    }).parse(req.body);
    const ipLimit = await hitLimit(`mfa:ip:${req.ip}`, 30, 300);
    if (!ipLimit.ok) throw new AppError(429, "RATE_LIMITED", "Too many attempts. Try again later.");

    const raw = await redis.get(mfaKey(mfaToken));
    if (!raw) throw Errors.unauthorized("MFA challenge expired. Please sign in again.");
    const { mailboxId, email, p, otp, passkeyChallenge } = JSON.parse(raw) as { mailboxId: string; email: string; p: string; otp?: string; passkeyChallenge?: string };

    let ok = false;
    if (passkey && passkeyChallenge) {
      ok = await verifyAuthentication(mailboxId, passkey, passkeyChallenge);
    } else if (code) {
      ok = (!!otp && code.trim() === otp) || (await verifyLoginCode(mailboxId, code));
    }

    if (!ok) {
      await recordFailure(`mfa:${mfaToken}`, 300);
      if ((await isLockedOut(`mfa:${mfaToken}`, 5)).locked) {
        await redis.del(mfaKey(mfaToken));
        throw Errors.unauthorized("Too many incorrect attempts. Please sign in again.");
      }
      throw Errors.invalidCredentials();
    }
    await redis.del(mfaKey(mfaToken));

    const mailbox = await prisma.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
    return reply.send({ success: true, data: await issueSession(req, reply, mailbox, email, decrypt(p)) });
  });

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies?.[WEBMAIL_COOKIE] ?? req.headers.authorization?.slice(7);
    if (token) await destroySession(token);
    reply.clearCookie(WEBMAIL_COOKIE, { path: "/" });
    return reply.send({ success: true });
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    const mailbox = await prisma.mailbox.findUnique({ where: { id: req.creds!.mailboxId }, select: { email: true, displayName: true } });
    const totpEnabled = await isTotpEnabled(req.creds!.mailboxId);
    const emailOtpEnabled = await isEmailOtpEnabled(req.creds!.mailboxId);
    const recoveryEmail = await getRecoveryEmail(req.creds!.mailboxId);
    return reply.send({ success: true, data: { ...mailbox, totpEnabled, emailOtpEnabled, recoveryEmail } });
  });

  // ── 2FA management (authenticated) ──
  app.post("/auth/2fa/setup", { preHandler: [app.authenticate] }, async (req, reply) =>
    reply.send({ success: true, data: await setupTotp(req.creds!.mailboxId, req.creds!.email) }),
  );

  app.post("/auth/2fa/verify", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
    if (!(await verifyAndEnable(req.creds!.mailboxId, code))) throw Errors.invalidCredentials();
    await recordEvent(req.creds!.mailboxId, "2fa_enabled", { ip: req.ip, detail: "authenticator" });
    return reply.send({ success: true, data: { totpEnabled: true } });
  });

  app.post("/auth/2fa/disable", { preHandler: [app.authenticate] }, async (req, reply) => {
    await disableTotp(req.creds!.mailboxId);
    await recordEvent(req.creds!.mailboxId, "2fa_disabled", { ip: req.ip, detail: "authenticator" });
    return reply.send({ success: true, data: { totpEnabled: false } });
  });

  // ── Active sessions (devices) ──
  app.get("/auth/sessions", { preHandler: [app.authenticate] }, async (req, reply) =>
    reply.send({ success: true, data: await listSessions(req.creds!.mailboxId, currentSessionHash(req)) }));

  app.post("/auth/sessions/:id/revoke", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const r = await revokeSession(req.creds!.mailboxId, id);
    if (r.revoked) await recordEvent(req.creds!.mailboxId, "session_revoked", { ip: req.ip });
    return reply.send({ success: true, data: r });
  });

  app.post("/auth/sessions/revoke-others", { preHandler: [app.authenticate] }, async (req, reply) => {
    const r = await revokeOtherSessions(req.creds!.mailboxId, currentSessionHash(req));
    if (r.revoked) await recordEvent(req.creds!.mailboxId, "session_revoked", { ip: req.ip, detail: `${r.revoked} others` });
    return reply.send({ success: true, data: r });
  });

  // ── Passkeys (WebAuthn) ──
  app.get("/auth/passkeys", { preHandler: [app.authenticate] }, async (req, reply) =>
    reply.send({ success: true, data: await listPasskeys(req.creds!.mailboxId) }));

  app.post("/auth/passkeys/register-options", { preHandler: [app.authenticate] }, async (req, reply) =>
    reply.send({ success: true, data: await getRegistrationOptions(req.creds!.mailboxId, req.creds!.email) }));

  app.post("/auth/passkeys/register", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { name, response } = z.object({ name: z.string().min(1).max(100), response: z.any() }).parse(req.body);
    await verifyRegistration(req.creds!.mailboxId, response, name);
    await recordEvent(req.creds!.mailboxId, "2fa_enabled", { ip: req.ip, detail: "passkey" });
    return reply.send({ success: true, data: { added: true } });
  });

  app.delete("/auth/passkeys/:id", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await deletePasskey(req.creds!.mailboxId, id);
    await recordEvent(req.creds!.mailboxId, "2fa_disabled", { ip: req.ip, detail: "passkey removed" });
    return reply.send({ success: true, data: { removed: true } });
  });

  // ── Security activity log ──
  app.get("/auth/security-log", { preHandler: [app.authenticate] }, async (req, reply) =>
    reply.send({ success: true, data: await listEvents(req.creds!.mailboxId) }));

  // ── Recovery email ──
  app.post("/auth/recovery-email", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    if (email.toLowerCase() === req.creds!.email.toLowerCase()) {
      throw new AppError(400, "INVALID_RECOVERY", "Use a different address than your own mailbox.");
    }
    await setRecoveryEmail(req.creds!.mailboxId, email);
    await recordEvent(req.creds!.mailboxId, "recovery_email_changed", { ip: req.ip });
    return reply.send({ success: true, data: { recoveryEmail: email.toLowerCase() } });
  });

  // ── Email-OTP 2FA (alternative to the authenticator app) ──
  app.post("/auth/2fa/email/setup", { preHandler: [app.authenticate] }, async (req, reply) => {
    const rec = await getRecoveryEmail(req.creds!.mailboxId);
    if (!rec) throw new AppError(400, "NO_RECOVERY_EMAIL", "Add a recovery email first.");
    const code = genOtp();
    await redis.set(otpSetupKey(req.creds!.mailboxId), code, "EX", 300);
    try {
      await sendOtpEmail(rec, code);
    } catch {
      throw new AppError(502, "SEND_FAILED", "Could not send the verification email — check the mail server is running.");
    }
    return reply.send({ success: true, data: { sent: true, hint: maskEmail(rec) } });
  });

  app.post("/auth/2fa/email/verify", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { code } = z.object({ code: z.string().min(6) }).parse(req.body);
    const stored = await redis.get(otpSetupKey(req.creds!.mailboxId));
    if (!stored || stored !== code.trim()) throw Errors.invalidCredentials();
    await redis.del(otpSetupKey(req.creds!.mailboxId));
    await setEmailOtpEnabled(req.creds!.mailboxId, true);
    await recordEvent(req.creds!.mailboxId, "2fa_enabled", { ip: req.ip, detail: "email code" });
    return reply.send({ success: true, data: { emailOtpEnabled: true } });
  });

  app.post("/auth/2fa/email/disable", { preHandler: [app.authenticate] }, async (req, reply) => {
    await setEmailOtpEnabled(req.creds!.mailboxId, false);
    await recordEvent(req.creds!.mailboxId, "2fa_disabled", { ip: req.ip, detail: "email code" });
    return reply.send({ success: true, data: { emailOtpEnabled: false } });
  });
}
