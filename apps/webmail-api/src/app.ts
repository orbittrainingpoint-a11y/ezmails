import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { errorHandler } from "./lib/errors.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.routes.js";
import mailRoutes from "./routes/mail.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import publicRoutes from "./routes/public.routes.js";
import ruleRoutes from "./routes/rule.routes.js";
import noteRoutes from "./routes/note.routes.js";
import advancedRoutes from "./routes/advanced.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    bodyLimit: env.ATTACHMENT_LIMIT_BYTES + 5 * 1024 * 1024, // headroom for base64 + JSON
    logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : { level: "info" },
  });

  app.setErrorHandler(errorHandler);

  // Tolerate empty bodies on POSTs that declare application/json (parse to undefined).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body || (body as string).trim() === "") return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(cors, { origin: [env.WEBMAIL_URL], credentials: true });
  await app.register(cookie);
  await app.register(authPlugin);

  app.get("/webmail-api/health", async () => ({ status: "ok", service: "webmail-api" }));

  // All webmail routes live under /webmail-api so the edge Nginx can route them
  // distinctly from the admin API (/api).
  await app.register(
    async (scope) => {
      await scope.register(authRoutes);
      await scope.register(mailRoutes);
      await scope.register(contactRoutes);
      await scope.register(settingsRoutes);
      // Titan features
      await scope.register(aiRoutes);
      await scope.register(campaignRoutes);
      await scope.register(bookingRoutes);
      await scope.register(ruleRoutes); // Outlook-style inbox rules
      await scope.register(noteRoutes); // per-email sticky notes
      await scope.register(advancedRoutes); // account, forwarding, blocked senders
      await scope.register(publicRoutes); // unauthenticated (tracking + public booking)
    },
    { prefix: "/webmail-api" },
  );

  return app;
}
