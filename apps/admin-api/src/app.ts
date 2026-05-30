import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";
import { env } from "./config/env.js";
import { errorHandler } from "./lib/errors.js";
import { verifyAccessToken } from "./lib/jwt.js";
import { addClient, type WsLike } from "./lib/ws-hub.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.routes.js";
import domainRoutes from "./routes/domain.routes.js";
import mailRoutes from "./routes/mail.routes.js";
import opsRoutes from "./routes/ops.routes.js";
import internalRoutes from "./routes/internal.routes.js";
import tenancyRoutes from "./routes/tenancy.routes.js";

// Prisma returns BigInt for byte-quota columns; make JSON.stringify emit them as strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true, // behind Nginx — derive req.ip from X-Forwarded-For
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty" } }
        : { level: "info" },
    genReqId: () => crypto.randomUUID(),
  });

  app.setErrorHandler(errorHandler);

  // Tolerate empty bodies on POSTs that declare application/json (e.g. /auth/refresh).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body || (body as string).trim() === "") return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: [env.ADMIN_PANEL_URL], credentials: true });
  await app.register(cookie);

  // Auth decorator (req.user / app.authenticate)
  await app.register(authPlugin);
  await app.register(websocket);

  // Health probe (used by Docker / Nginx).
  app.get("/health", async () => ({ status: "ok", service: "admin-api" }));

  // Real-time dashboard channel (TRD §5.4): wss://.../ws?token=<jwt>
  app.register(async (scope) => {
    scope.get("/ws", { websocket: true }, async (socket, req) => {
      const token = (req.query as { token?: string }).token;
      try {
        if (!token) throw new Error("no token");
        await verifyAccessToken(token);
      } catch {
        socket.close(1008, "unauthorized");
        return;
      }
      addClient(socket as unknown as WsLike);
    });
  });

  // API v1
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(domainRoutes, { prefix: "/api/v1/domains" });
  await app.register(mailRoutes, { prefix: "/api/v1" });
  await app.register(opsRoutes, { prefix: "/api/v1" });
  await app.register(tenancyRoutes, { prefix: "/api/v1" });
  await app.register(internalRoutes, { prefix: "/api/v1/internal" });

  return app;
}
