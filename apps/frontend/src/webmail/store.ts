import { create } from "zustand";

interface WmProfile {
  email: string;
  displayName: string | null;
  totpEnabled?: boolean;
}

interface WmState {
  profile: WmProfile | null;
  hydrated: boolean;
  setProfile: (p: WmProfile) => void;
  setHydrated: () => void;
  clear: () => void;
}

export const useWebmail = create<WmState>((set) => ({
  profile: null,
  hydrated: false,
  setProfile: (profile) => set({ profile }),
  setHydrated: () => set({ hydrated: true }),
  clear: () => set({ profile: null }),
}));
