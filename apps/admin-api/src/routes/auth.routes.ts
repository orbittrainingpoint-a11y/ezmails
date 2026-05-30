import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@ezmails/db";
import {
  loginSchema,
  mfaVerifySchema,
  totpSetupVerifySchema,
  refreshSchema,
  resetRequestSchema,
  resetSchema,
  forceLogoutSchema,
} from "../schemas/auth.schema.js";
import { signAccessToken } from "../lib/jwt.js";
import { env } from "../config/env.js";
import { Errors } from "../lib/errors.js";
import { ipRateLimit } from "../plugins/rate-limit.js";
import { requireRole } from "../plugins/rbac.js";
import {
  verifyCredentials,
  startMfaChallenge,
  consumeMfaChallenge,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service.js";
import {
  createSession,
  resolveSession,
  revokeSession,
  revokeAllSessions,
  listSessions,
} from "../services/session.service.js";
import {
  setupTotp,
  verifyTotpCode,
  enableTotp,
  consumeRecoveryCode,
} from "../services/totp.service.js";
import { recordAudit } from "../services/audit.service.js";

const REFRESH_COOKIE = "ezmails_rt";

/** Create a refresh session, set the httpOnly cookie, and return the auth payload. */
async function issueTokens(
  reply: FastifyReply,
  req: FastifyRequest,
  user: { id: string; role: "super_admin" | "reseller" | "customer"; email: string; displayName: string | null },
  rememberMe: boolean,
) {
  const access = await signAccessToken({ sub: user.id, role: user.role });
  const { token: refresh, expiresAt } = await createSession({
    userId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    rememberMe,
  });

  reply.setCookie(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: env.NODE_ENV === "production", // http on localhost in dev
    sameSite: "lax",
    path: "/api/v1/auth",
    expires: expiresAt,
  });

  return {
    success: true,
    data: {
      accessToken: access,
      refreshToken: refresh,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    },
  };
}

export default async function authRoutes(app: FastifyInstance) {
  // ── Login (AUTH-001) ──
  app.post("/login", { preHandler: ipRateLimit("login", 10, 60) }, async (req, reply) => {
    const { email, password, rememberMe } = loginSchema.parse(req.body);
    const user = await verifyCredentials(email, password);

    await recordAudit({
      userId: user.id,
      action: "auth.login.password_ok",
      ipAddress: req.ip,
      metadata: { userAgent: req.headers["user-agent"] },
    });

    // AUTH-002: gate behind TOTP if enabled.
    if (user.totpEnabled) {
      const mfaToken = await startMfaChallenge(user.id);
      return reply.send({ success: true, data: { mfaRequired: true, mfaToken } });
    }

    return reply.send(await issueTokens(reply, req, user, rememberMe));
  });

  // ── Complete MFA challenge → full session ──
  app.post("/mfa/verify", { preHandler: ipRateLimit("mfa", 10, 60) }, async (req, reply) => {
    const { mfaToken, code, rememberMe } = mfaVerifySchema.parse(req.body);
    const userId = await consumeMfaChallenge(mfaToken);
    if (!userId) throw Errors.invalidToken("MFA challenge expired. Please log in again.");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) throw Errors.unauthorized();

    const viaTotp = verifyTotpCode(user.totpSecret, code);
    const viaRecovery = viaTotp ? false : await consumeRecoveryCode(user.id, code);
    if (!viaTotp && !viaRecovery) {
      await recordAudit({ userId: user.id, action: "auth.mfa.fail", ipAddress: req.ip });
      throw Errors.invalidCredentials();
    }

    await recordAudit({
      userId: user.id,
      action: viaRecovery ? "auth.mfa.recovery_ok" : "auth.mfa.totp_ok",
      ipAddress: req.ip,
    });
    return reply.send(await issueTokens(reply, req, user, rememberMe));
  });

  // ── Refresh access token (AUTH-005) ──
  app.post("/refresh", async (req, reply) => {
    const body = refreshSchema.parse(req.body ?? {});
    const raw = body.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw Errors.unauthorized();

    const session = await resolveSession(raw);
    if (!session) throw Errors.invalidToken("Session expired. Please log in again.");

    const access = await signAccessToken({ sub: session.user.id, role: session.user.role });
    return reply.send({ success: true, data: { accessToken: access } });
  });

  // ── Logout ──
  app.post("/logout", async (req, reply) => {
    const raw = (req.body as { refreshToken?: string })?.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (raw) await revokeSession(raw);
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
    return reply.send({ success: true });
  });

  // ── TOTP setup (AUTH-002/003) ──
  app.post(
    "/totp/setup",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      const { otpauth, qrDataUrl, recoveryCodes } = await setupTotp({ id: me.id, email: me.email });
      await recordAudit({ userId: me.id, action: "auth.totp.setup_started", ipAddress: req.ip });
      return reply.send({ success: true, data: { otpauth, qrDataUrl, recoveryCodes } });
    },
  );

  // ── TOTP verify (activates 2FA) ──
  app.post(
    "/totp/verify",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { code } = totpSetupVerifySchema.parse(req.body);
      const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!me.totpSecret) throw Errors.invalidToken("Start TOTP setup first.");
      if (!verifyTotpCode(me.totpSecret, code)) throw Errors.invalidCredentials();

      await enableTotp(me.id);
      await recordAudit({ userId: me.id, action: "auth.totp.enabled", ipAddress: req.ip });
      return reply.send({ success: true, data: { totpEnabled: true } });
    },
  );

  // ── Password reset request (AUTH-009) ──
  app.post(
    "/password/reset-request",
    { preHandler: ipRateLimit("pwreset", 5, 60) },
    async (req, reply) => {
      const { email } = resetRequestSchema.parse(req.body);
      await requestPasswordReset(email);
      // Always 200 — never reveal whether the email exists.
      return reply.send({ success: true });
    },
  );

  // ── Password reset complete ──
  app.post("/password/reset", { preHandler: ipRateLimit("pwreset", 5, 60) }, async (req, reply) => {
    const { token, password } = resetSchema.parse(req.body);
    await resetPassword(token, password);
    return reply.send({ success: true });
  });

  // ── Current user ──
  app.get("/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    const me = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { id: true, email: true, displayName: true, role: true, totpEnabled: true },
    });
    return reply.send({ success: true, data: me });
  });

  // ── Active sessions for current user ──
  app.get("/sessions", { preHandler: [app.authenticate] }, async (req, reply) => {
    return reply.send({ success: true, data: await listSessions(req.user!.id) });
  });

  // ── Admin: force-logout all sessions for any user (AUTH-008) ──
  app.post(
    "/force-logout",
    { preHandler: [app.authenticate, requireRole("super_admin")] },
    async (req, reply) => {
      const { userId } = forceLogoutSchema.parse(req.body);
      const count = await revokeAllSessions(userId);
      await recordAudit({
        userId: req.user!.id,
        action: "auth.force_logout",
        resourceType: "user",
        resourceId: userId,
        ipAddress: req.ip,
        metadata: { revoked: count },
      });
      return reply.send({ success: true, data: { revoked: count } });
    },
  );
}
