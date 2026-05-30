import { useEffect, useRef } from "react";
import { useAuth } from "@/stores/auth";

export interface WsEvent {
  event: "node:stats" | "queue:update" | "alert";
  data: unknown;
}

/**
 * Subscribe to the admin real-time channel. Reconnects when the access token
 * changes; the latest handler is held in a ref so it never forces a reconnect.
 */
export function useWebSocket(onEvent: (ev: WsEvent) => void) {
  const token = useAuth((s) => s.accessToken);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!token) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data) as WsEvent);
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => ws.close();
  }, [token]);
}
