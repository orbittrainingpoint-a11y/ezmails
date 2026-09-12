import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "@ezmails/db";
import { env } from "../config/env.js";
import { Errors } from "../lib/errors.js";
import { resolveDns, stripTrailingDot } from "../lib/dns.js";
import { broadcast } from "../lib/ws-hub.js";

export type DeliveryTestStage =
  | "resolving_mx"
  | "connecting"
  | "sent"
  | "waiting_for_delivery"
  | "passed"
  | "failed"
  | "timeout";

const QUEUED_ID_RE = /queued as ([0-9A-Za-z]+)/i;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 45_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function emit(domainId: string, stage: DeliveryTestStage, detail?: string) {
  await broadcast({ event: "domain:delivery-test", data: { domainId, stage, detail } });
}

/**
 * DOM-020: prove inbound delivery actually works, not just that DNS strings
 * match — the exact gap that let the assessexpert.com incident go undetected.
 * Connects directly to the domain's real MX on port 25 (bypassing any local
 * relay) to faithfully act like an external sender, the same technique
 * already verified by hand over SSH during that incident.
 */
export async function runDeliveryTest(domainId: string, mailboxId: string): Promise<void> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) throw Errors.notFound("Domain not found.");
  if (domain.sourceType !== "vps_hosted") {
    throw Errors.badRequest(
      "This domain is outbound-only (inbound mail is routed elsewhere) — inbound delivery testing isn't applicable here.",
    );
  }

  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox || mailbox.domainId !== domainId) {
    throw Errors.badRequest("That mailbox does not belong to this domain.");
  }
  if (mailbox.status !== "active") {
    throw Errors.badRequest("Add or activate a mailbox on this domain first to test delivery.");
  }

  // Fire-and-forget: the caller gets a 202 immediately, progress comes via WS.
  void runDeliveryTestInternal(domain.id, domain.domainName, mailbox.email).catch(() => {});
}

async function persistResult(domainId: string, status: string, detail: string | null) {
  await prisma.domain.update({
    where: { id: domainId },
    data: { lastDeliveryTestAt: new Date(), lastDeliveryTestStatus: status, lastDeliveryTestDetail: detail },
  });
}

/** Exported for unit testing — the actual SMTP-injection + polling flow. */
export async function runDeliveryTestInternal(
  domainId: string,
  domainName: string,
  mailboxEmail: string,
  opts: { pollIntervalMs?: number; pollTimeoutMs?: number } = {},
): Promise<void> {
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const pollTimeoutMs = opts.pollTimeoutMs ?? POLL_TIMEOUT_MS;
  await emit(domainId, "resolving_mx");
  let mxHost: string;
  try {
    const answers = await resolveDns(domainName, "MX");
    if (answers.length === 0) throw new Error("No MX record found.");
    // Lowest preference value wins; answers look like "10 mail.example.com."
    const best = answers
      .map((a) => {
        const [pref, host] = a.split(/\s+/);
        return { pref: Number(pref) || 0, host: stripTrailingDot(host ?? "") };
      })
      .sort((a, b) => a.pref - b.pref)[0]!;
    mxHost = best.host;
  } catch (err) {
    const detail = `Could not resolve MX for ${domainName}: ${err instanceof Error ? err.message : String(err)}`;
    await persistResult(domainId, "failed", detail);
    await emit(domainId, "failed", detail);
    return;
  }

  await emit(domainId, "connecting", mxHost);
  const token = randomBytes(8).toString("hex");
  const transport = nodemailer.createTransport({
    host: mxHost,
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10_000,
  });

  let queueId: string | null = null;
  try {
    const info = await transport.sendMail({
      from: `delivery-test@${env.MAIL_HOSTNAME}`,
      to: mailboxEmail,
      subject: `ezmails delivery test ${token}`,
      text: `Automated inbound delivery test (token ${token}). Safe to ignore/delete.`,
    });
    const response = typeof info.response === "string" ? info.response : "";
    const match = QUEUED_ID_RE.exec(response);
    if (!match) {
      const detail = `The mail server at ${mxHost} accepted the message but its response didn't look like this server ("${response}") — check that MX for ${domainName} really points here.`;
      await persistResult(domainId, "unexpected_response", detail);
      await emit(domainId, "failed", detail);
      return;
    }
    queueId = match[1] ?? null;
  } catch (err) {
    const detail = `Could not deliver to ${mxHost}: ${err instanceof Error ? err.message : String(err)}`;
    await persistResult(domainId, "failed", detail);
    await emit(domainId, "failed", detail);
    return;
  }

  await emit(domainId, "sent", queueId ?? undefined);
  await emit(domainId, "waiting_for_delivery");

  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    const row = await prisma.mailLog.findFirst({ where: { queueId, recipient: mailboxEmail } });
    if (row) {
      if (row.status === "delivered") {
        await persistResult(domainId, "passed", `Delivered via queue id ${queueId}.`);
        await emit(domainId, "passed", queueId ?? undefined);
        return;
      }
      if (row.status === "bounced" || row.status === "rejected") {
        const detail = row.detail ?? `Delivery ${row.status}.`;
        await persistResult(domainId, "failed", detail);
        await emit(domainId, "failed", detail);
        return;
      }
    }
    await sleep(pollIntervalMs);
  }

  const detail = `Message was queued (id ${queueId}) but no delivery confirmation appeared within ${pollTimeoutMs / 1000}s.`;
  await persistResult(domainId, "timeout", detail);
  await emit(domainId, "timeout", detail);
}
