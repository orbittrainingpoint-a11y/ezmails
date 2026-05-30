import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(6).max(12), // TOTP (6) or recovery code (e.g. ABCD-EFGH)
  rememberMe: z.boolean().optional().default(false),
});

export const totpSetupVerifySchema = z.object({
  code: z.string().length(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(), // falls back to cookie
});

export const resetRequestSchema = z.object({
  email: z.string().email(),
});

export const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const forceLogoutSchema = z.object({
  userId: z.string().uuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
