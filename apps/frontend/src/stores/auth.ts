import { create } from "zustand";

export type Role = "super_admin" | "reseller" | "customer";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  totpEnabled?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  /** True once we've attempted to restore a session on app load. */
  hydrated: boolean;
  setAuth: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  setHydrated: () => void;
  clear: () => void;
}

// The access token lives only in memory (never localStorage). The refresh token
// is an httpOnly cookie set by the API, so sessions survive reloads via /refresh.
export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  hydrated: false,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setHydrated: () => set({ hydrated: true }),
  clear: () => set({ user: null, accessToken: null }),
}));
