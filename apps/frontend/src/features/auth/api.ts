import { api } from "@/lib/api";
import type { AuthUser } from "@/stores/auth";

export interface LoginSuccess {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}
export type LoginResult = LoginSuccess | MfaChallenge;

export const isMfaChallenge = (r: LoginResult): r is MfaChallenge =>
  (r as MfaChallenge).mfaRequired === true;

export function login(email: string, password: string, rememberMe: boolean) {
  return api<LoginResult>("/auth/login", { method: "POST", body: { email, password, rememberMe } });
}

export function verifyMfa(mfaToken: string, code: string, rememberMe: boolean) {
  return api<LoginSuccess>("/auth/mfa/verify", { method: "POST", body: { mfaToken, code, rememberMe } });
}

export function requestPasswordReset(email: string) {
  return api<unknown>("/auth/password/reset-request", { method: "POST", body: { email } });
}

export function resetPassword(token: string, password: string) {
  return api<unknown>("/auth/password/reset", { method: "POST", body: { token, password } });
}

export function fetchMe() {
  return api<AuthUser>("/auth/me");
}

export function logout() {
  return api<unknown>("/auth/logout", { method: "POST" });
}
