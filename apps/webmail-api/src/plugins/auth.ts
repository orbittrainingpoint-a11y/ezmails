import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSession, type WebmailCreds } from "../lib/session.js";
import { Errors } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    creds?: WebmailCreds;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const COOKIE = "ezmails_wm";

export default fp(async (app) => {
  app.decorate("authenticate", async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
    const token = bearer ?? req.cookies?.[COOKIE];
    if (!token) throw Errors.unauthorized();
    const creds = await resolveSession(token);
    if (!creds) throw Errors.unauthorized("Session expired.");
    req.creds = creds;
  });
});

export const WEBMAIL_COOKIE = COOKIE;
