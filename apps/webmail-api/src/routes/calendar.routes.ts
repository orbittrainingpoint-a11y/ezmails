import type { FastifyInstance } from "fastify";
import { prisma } from "@ezmails/db";

interface Share { email?: string; perm?: string }
interface Cal { id?: string; name?: string; color?: string; shares?: Share[] }
interface Mtg { id?: string; title?: string; startsAt?: string; endsAt?: string; notes?: string; link?: string; calendarId?: string }

/** Calendars other mailboxes have shared with the current user (read-only view). */
export default async function calendarRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/calendars/shared", async (req, reply) => {
    const me = await prisma.mailbox.findUnique({ where: { id: req.creds!.mailboxId }, select: { email: true } });
    const myEmail = me?.email?.toLowerCase();
    if (!myEmail) return reply.send({ success: true, data: [] });

    // PERF: sharing is stored inside each mailbox's own prefs JSON blob (no
    // dedicated share table/index exists), so finding "shared with me" means
    // scanning other mailboxes' settings — there's no query that can filter
    // this at the DB level without a real CalendarShare table (a bigger
    // follow-up, not done here). Bounding it at least caps the worst case
    // instead of scanning every mailbox on the platform on every request.
    const rows = await prisma.webmailSettings.findMany({
      where: { NOT: { mailboxId: req.creds!.mailboxId } },
      select: { mailboxId: true, prefs: true },
      take: 5000,
    });

    type Hit = { ownerId: string; calId: string; name: string; color: string; perm: string; events: Mtg[] };
    const hits: Hit[] = [];
    for (const r of rows) {
      const prefs = (r.prefs ?? {}) as { calendars?: Cal[]; meetings?: Mtg[] };
      const cals = Array.isArray(prefs.calendars) ? prefs.calendars : [];
      const meetings = Array.isArray(prefs.meetings) ? prefs.meetings : [];
      const firstId = cals[0]?.id;
      for (const c of cals) {
        if (!c.id) continue;
        const share = (Array.isArray(c.shares) ? c.shares : []).find((s) => s?.email?.toLowerCase() === myEmail);
        if (!share) continue;
        hits.push({
          ownerId: r.mailboxId,
          calId: c.id,
          name: c.name ?? "Shared calendar",
          color: c.color ?? "#3b82f6",
          perm: share.perm === "edit" ? "edit" : "view",
          events: meetings.filter((m) => (m.calendarId ?? firstId) === c.id),
        });
      }
    }

    if (hits.length === 0) return reply.send({ success: true, data: [] });

    const owners = await prisma.mailbox.findMany({
      where: { id: { in: [...new Set(hits.map((h) => h.ownerId))] } },
      select: { id: true, email: true, displayName: true },
    });
    const ownerMap = new Map(owners.map((o) => [o.id, o]));

    const data = hits.map((h) => {
      const o = ownerMap.get(h.ownerId);
      return {
        id: `${o?.email ?? h.ownerId}:${h.calId}`,
        name: h.name,
        color: h.color,
        perm: h.perm,
        ownerEmail: o?.email ?? "",
        ownerName: o?.displayName ?? null,
        events: h.events,
      };
    });
    return reply.send({ success: true, data });
  });
}
