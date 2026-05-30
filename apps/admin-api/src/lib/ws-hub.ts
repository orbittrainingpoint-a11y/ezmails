import { Redis } from "ioredis";
import { env } from "../config/env.js";

// Structural type for the bits of a ws socket we use (avoids a fragile
// type-only import from @fastify/websocket under "Bundler" resolution).
export interface WsLike {
  readonly readyState: number;
  readonly OPEN: number;
  send(data: string): void;
  on(event: "close" | "error", cb: () => void): void;
  close(code?: number, reason?: string): void;
}

/**
 * Real-time hub for the admin dashboard (TRD §5.4). Clients connect over
 * WebSocket; the API broadcasts node:stats, queue:update, and alert events.
 * Cross-instance fan-out goes through Redis pub/sub so any API replica can
 * publish and every connected client receives it.
 */
const CHANNEL = "ezmails:events";

interface WsEvent {
  event: "node:stats" | "queue:update" | "alert";
  data: unknown;
}

const clients = new Set<WsLike>();

// Separate Redis connections: one to publish, one to subscribe.
const pub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
const sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });

let started = false;

export async function startWsHub(): Promise<void> {
  if (started) return;
  started = true;
  await pub.connect().catch(() => {});
  await sub.connect().catch(() => {});
  await sub.subscribe(CHANNEL).catch(() => {});
  sub.on("message", (_channel, payload) => {
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  });
}

export function addClient(ws: WsLike): void {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
}

/** Publish an event to all connected clients (via Redis fan-out). */
export async function broadcast(event: WsEvent): Promise<void> {
  await pub.publish(CHANNEL, JSON.stringify(event)).catch(() => {});
}
