import { useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { api } from "@/lib/api";
import { fetchMe } from "./api";

/**
 * On app load, try to restore a session: refresh the access token from the
 * httpOnly cookie, then load the current user. Marks the store hydrated either
 * way so the router can stop showing the splash spinner.
 */
export function useBootstrapAuth() {
  const { setAuth, setAccessToken, setHydrated, clear } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refreshed = await api<{ accessToken: string }>("/auth/refresh", { method: "POST" });
        if (cancelled) return;
        setAccessToken(refreshed.accessToken);
        const me = await fetchMe();
        if (!cancelled) setAuth(me, refreshed.accessToken);
      } catch {
        if (!cancelled) clear();
      } finally {
        if (!cancelled) setHydrated();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
