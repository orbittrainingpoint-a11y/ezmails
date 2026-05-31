import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDomainSchema,
  updateDomainSchema,
  suspendDomainSchema,
  listDomainsQuery,
} from "../schemas/domain.schema.js";
import { sendSystemMail } from "../lib/mailer.js";
import { requireRole } from "../plugins/rbac.js";
import { domainScope, getScopedDomain } from "../lib/scope.js";
import { recordAudit } from "../services/audit.service.js";
import {
  createDomain,
  listDomains,
  getDomainDetail,
  updateDomain,
  setDomainSuspended,
  deleteDomain,
} from "../services/domain.service.js";
import { validateDomainDns } from "../services/dns.service.js";
import { listDkimKeys, rotateDkim } from "../services/dkim.service.js";

export default async function domainRoutes(app: FastifyInstance) {
  // All domain routes require authentication.
  app.addHook("preHandler", app.authenticate);

  const canManage = requireRole("super_admin", "reseller");

  // ── List (scoped) ──
  app.get("/", async (req, reply) => {
    const q = listDomainsQuery.parse(req.query);
    const scope = await domainScope(req.user!);
    return reply.send({ success: true, data: await listDomains(scope, q) });
  });

  // ── Create ──
  app.post("/", { preHandler: canManage }, async (req, reply) => {
    const input = createDomainSchema.parse(req.body);
    // Resellers may only assign domains to themselves or their own customers.
    const ownerId = req.user!.role === "reseller" ? (input.ownerId ?? req.user!.id) : input.ownerId;
    const domain = await createDomain({ ...input, ownerId });
    await recordAudit({
      userId: req.user!.id,
      action: "domain.create",
      resourceType: "domain",
      resourceId: domain.id,
      ipAddress: req.ip,
      metadata: { domainName: domain.domainName },
    });
    return reply.status(201).send({ success: true, data: domain });
  });

  // ── Detail ──
  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    return reply.send({ success: true, data: await getDomainDetail(id) });
  });

  // ── Update settings ──
  app.patch("/:id", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    const patch = updateDomainSchema.parse(req.body);
    const domain = await updateDomain(id, patch);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.update",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: patch as Record<string, unknown>,
    });
    return reply.send({ success: true, data: domain });
  });

  // ── Delete ──
  app.delete("/:id", { preHandler: requireRole("super_admin") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getScopedDomain(req.user!, id);
    await deleteDomain(id);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.delete",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { domainName: domain.domainName },
    });
    return reply.send({ success: true });
  });

  // ── Suspend / unsuspend (DOM-015) ──
  app.post("/:id/suspend", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    const { reason } = suspendDomainSchema.parse(req.body ?? {});
    const domain = await setDomainSuspended(id, true, reason);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.suspend",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { reason },
    });
    return reply.send({ success: true, data: domain });
  });

  app.post("/:id/unsuspend", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    const domain = await setDomainSuspended(id, false);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.unsuspend",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
    });
    return reply.send({ success: true, data: domain });
  });

  // ── DNS records + validation (DOM-003/005/006) ──
  app.get("/:id/dns", async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getScopedDomain(req.user!, id);
    const records = await getDomainDetail(domain.id);
    return reply.send({ success: true, data: records.dnsRecords });
  });

  app.post("/:id/dns/validate", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    const results = await validateDomainDns(id);
    return reply.send({ success: true, data: results });
  });

  // ── Email the DNS setup instructions to the domain owner / customer ──
  app.post("/:id/dns/send", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getScopedDomain(req.user!, id);
    const { email, note } = z
      .object({ email: z.string().email(), note: z.string().max(2000).optional() })
      .parse(req.body);
    const detail = await getDomainDetail(domain.id);
    const records = (detail.dnsRecords ?? []) as { recordType: string; hostname: string | null; expectedValue: string }[];
    const { text, html } = buildDnsEmail(domain.domainName, records, note);
    await sendSystemMail({ to: email, subject: `DNS setup for ${domain.domainName}`, text, html });
    await recordAudit({
      userId: req.user!.id,
      action: "domain.dns.send",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { email },
    });
    return reply.send({ success: true });
  });

  // ── DKIM (DKIM-002/003/004) ──
  app.get("/:id/dkim", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getScopedDomain(req.user!, id);
    return reply.send({ success: true, data: await listDkimKeys(id) });
  });

  app.post("/:id/dkim/rotate", { preHandler: canManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await getScopedDomain(req.user!, id);
    const key = await rotateDkim(id, domain.domainName);
    await recordAudit({
      userId: req.user!.id,
      action: "domain.dkim.rotate",
      resourceType: "domain",
      resourceId: id,
      ipAddress: req.ip,
      metadata: { selector: key.selector },
    });
    return reply.send({ success: true, data: key });
  });
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Build a clear plain-text + HTML email listing the DNS records to publish. */
function buildDnsEmail(
  domainName: string,
  records: { recordType: string; hostname: string | null; expectedValue: string }[],
  note?: string,
) {
  const text =
    `Hello,\n\nTo set up email for ${domainName}, please add the following DNS records ` +
    `at your domain's DNS provider (the place that manages ${domainName}'s nameservers):\n\n` +
    records.map((r) => `• ${r.recordType}\n   Host/Name: ${r.hostname || "@"}\n   Value: ${r.expectedValue}`).join("\n\n") +
    `\n\n${note ? note + "\n\n" : ""}After adding them it can take a few hours to take effect. ` +
    `Once they verify, email for ${domainName} will work.\n`;

  const rows = records
    .map(
      (r) =>
        `<tr>` +
        `<td style="padding:8px 12px;border:1px solid #e0e0e0;white-space:nowrap"><b>${esc(r.recordType)}</b></td>` +
        `<td style="padding:8px 12px;border:1px solid #e0e0e0">${esc(r.hostname || "@")}</td>` +
        `<td style="padding:8px 12px;border:1px solid #e0e0e0;font-family:monospace;word-break:break-all">${esc(r.expectedValue)}</td>` +
        `</tr>`,
    )
    .join("");
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5">` +
    `<p>Hello,</p>` +
    `<p>To set up email for <b>${esc(domainName)}</b>, add these DNS records at your domain's DNS provider ` +
    `(wherever <b>${esc(domainName)}</b>'s nameservers are managed):</p>` +
    `<table style="border-collapse:collapse;font-size:13px">` +
    `<tr><th style="padding:8px 12px;border:1px solid #e0e0e0;text-align:left;background:#f6f6f6">Type</th>` +
    `<th style="padding:8px 12px;border:1px solid #e0e0e0;text-align:left;background:#f6f6f6">Host / Name</th>` +
    `<th style="padding:8px 12px;border:1px solid #e0e0e0;text-align:left;background:#f6f6f6">Value</th></tr>` +
    `${rows}</table>` +
    `${note ? `<p>${esc(note)}</p>` : ""}` +
    `<p style="color:#555">After adding them it can take a few hours to propagate. Once verified, email for ${esc(domainName)} will work.</p>` +
    `</div>`;
  return { text, html };
}
