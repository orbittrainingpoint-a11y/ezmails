import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@ezmails/db";
import { getAccount, updateDisplayName, changePassword } from "../services/account.service.js";
import { listTrackers } from "../services/tracking.service.js";

/** Advanced webmail settings: account, forwarding, blocked senders. */
export default async function advancedRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // ── Account ──
  app.get("/account", async (req, reply) => reply.send({ success: true, data: await getAccount(req.creds!.mailboxId) }));

  app.patch("/account", async (req, reply) => {
    const { displayName } = z.object({ displayName: z.string().min(1).max(255) }).parse(req.body);
    return reply.send({ success: true, data: await updateDisplayName(req.creds!.mailboxId, displayName) });
  });

  app.post("/account/password", async (req, reply) => {
    const { current, next } = z.object({ current: z.string().min(1), next: z.string().min(8) }).parse(req.body);
    return reply.send({ success: true, data: await changePassword(req.creds!.mailboxId, current, next) });
  });

  // ── Forwarding (per-mailbox) ──
  app.get("/forwarding", async (req, reply) => {
    const mb = await prisma.mailbox.findUniqueOrThrow({ where: { id: req.creds!.mailboxId } });
    const rows = await prisma.forwarder.findMany({ where: { source: mb.email }, orderBy: { createdAt: "desc" } });
    return reply.send({ success: true, data: rows });
  });

  app.post("/forwarding", async (req, reply) => {
    const { destination, keepCopy } = z.object({ destination: z.string().email(), keepCopy: z.boolean().optional() }).parse(req.body);
    const mb = await prisma.mailbox.findUniqueOrThrow({ where: { id: req.creds!.mailboxId } });
    const row = await prisma.forwarder.create({
      data: { domainId: mb.domainId, source: mb.email, destination: destination.toLowerCase(), keepCopy: keepCopy ?? false },
    });
    return reply.send({ success: true, data: row });
  });

  app.delete("/forwarding/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const mb = await prisma.mailbox.findUniqueOrThrow({ where: { id: req.creds!.mailboxId } });
    await prisma.forwarder.deleteMany({ where: { id, source: mb.email } });
    return reply.send({ success: true });
  });

  // ── Blocked senders (stored in WebmailSettings.prefs) ──
  app.get("/senders/blocked", async (req, reply) => {
    const s = await prisma.webmailSettings.findUnique({ where: { mailboxId: req.creds!.mailboxId } });
    const blocked = ((s?.prefs as { blockedSenders?: string[] } | null)?.blockedSenders) ?? [];
    return reply.send({ success: true, data: blocked });
  });

  app.post("/senders/blocked", async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const mailboxId = req.creds!.mailboxId;
    const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
    const prefs = (s?.prefs as Record<string, unknown> | null) ?? {};
    const blocked = new Set<string>(((prefs.blockedSenders as string[]) ?? []));
    blocked.add(email.toLowerCase());
    const nextPrefs = { ...prefs, blockedSenders: [...blocked] };
    await prisma.webmailSettings.upsert({ where: { mailboxId }, create: { mailboxId, prefs: nextPrefs }, update: { prefs: nextPrefs } });
    return reply.send({ success: true, data: [...blocked] });
  });

  app.delete("/senders/blocked", async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const mailboxId = req.creds!.mailboxId;
    const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
    const prefs = (s?.prefs as Record<string, unknown> | null) ?? {};
    const blocked = ((prefs.blockedSenders as string[]) ?? []).filter((e) => e !== email.toLowerCase());
    const nextPrefs = { ...prefs, blockedSenders: blocked };
    await prisma.webmailSettings.upsert({ where: { mailboxId }, create: { mailboxId, prefs: nextPrefs }, update: { prefs: nextPrefs } });
    return reply.send({ success: true, data: blocked });
  });

  // ── Allowed senders / safe list (prefs.allowedSenders) ──
  const readList = async (mailboxId: string, key: string) => {
    const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
    return ((s?.prefs as Record<string, string[]> | null)?.[key]) ?? [];
  };
  const writeList = async (mailboxId: string, key: string, list: string[]) => {
    const s = await prisma.webmailSettings.findUnique({ where: { mailboxId } });
    const prefs = (s?.prefs as Record<string, unknown> | null) ?? {};
    const nextPrefs = { ...prefs, [key]: list } as Prisma.InputJsonValue;
    await prisma.webmailSettings.upsert({ where: { mailboxId }, create: { mailboxId, prefs: nextPrefs }, update: { prefs: nextPrefs } });
  };

  app.get("/senders/allowed", async (req, reply) =>
    reply.send({ success: true, data: await readList(req.creds!.mailboxId, "allowedSenders") }));

  app.post("/senders/allowed", async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const list = new Set(await readList(req.creds!.mailboxId, "allowedSenders"));
    list.add(email.toLowerCase());
    await writeList(req.creds!.mailboxId, "allowedSenders", [...list]);
    return reply.send({ success: true, data: [...list] });
  });

  app.delete("/senders/allowed", async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const list = (await readList(req.creds!.mailboxId, "allowedSenders")).filter((e) => e !== email.toLowerCase());
    await writeList(req.creds!.mailboxId, "allowedSenders", list);
    return reply.send({ success: true, data: list });
  });

  // ── Read tracking ──
  app.get("/tracking", async (req, reply) =>
    reply.send({ success: true, data: await listTrackers(req.creds!.mailboxId) }));

  // ── Send identities (primary address + aliases that deliver to this mailbox) ──
  app.get("/identities", async (req, reply) => {
    const mb = await prisma.mailbox.findUniqueOrThrow({ where: { id: req.creds!.mailboxId }, select: { email: true, displayName: true } });
    const me = mb.email.toLowerCase();
    const aliases = await prisma.alias.findMany({ where: { isActive: true, isWildcard: false, destination: { contains: me } } });
    const aliasAddrs = aliases
      .filter((a) => a.destination.split(",").map((d) => d.trim().toLowerCase()).includes(me))
      .map((a) => a.source.toLowerCase());
    const all = [me, ...aliasAddrs].filter((v, i, arr) => arr.indexOf(v) === i);
    return reply.send({ success: true, data: all.map((email) => ({ email, name: mb.displayName ?? "" })) });
  });
}
