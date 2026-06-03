#!/usr/bin/env node
// ezmails node agent — exposes Postfix queue control + host stats over HTTP on the
// internal network. The admin-api (lib/node-agent.ts) is the only caller.
// Auth: x-internal-token header must equal INTERNAL_TOKEN (when set).
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { open } from "node:fs/promises";
import { statSync } from "node:fs";
import os from "node:os";

const exec = promisify(execFile);
const PORT = Number(process.env.NODE_AGENT_PORT || 9101);
const TOKEN = process.env.INTERNAL_TOKEN || "";
const MAILLOG_FILE = process.env.MAILLOG_FILE || "/var/log/postfix.log";
const ADMIN_API_URL = process.env.ADMIN_API_INTERNAL_URL || "http://admin-api:3001";

function cpuPercent() {
  // Approximate from 1-minute load average across cores.
  const load = os.loadavg()[0];
  return Math.min(100, Math.round((load / os.cpus().length) * 100));
}

async function diskPercent() {
  try {
    const { stdout } = await exec("df", ["-P", "/var/mail"]);
    const line = stdout.trim().split("\n").pop() || "";
    const m = line.match(/(\d+)%/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

async function queueDepth() {
  try {
    const { stdout } = await exec("postqueue", ["-j"]);
    return stdout.trim() ? stdout.trim().split("\n").length : 0;
  } catch {
    return 0;
  }
}

async function listQueue() {
  try {
    const { stdout } = await exec("postqueue", ["-j"]);
    if (!stdout.trim()) return [];
    return stdout.trim().split("\n").map((line) => {
      const j = JSON.parse(line);
      const rcpt = (j.recipients && j.recipients[0]) || {};
      return {
        queueId: j.queue_id,
        sender: j.sender,
        recipient: rcpt.address || "",
        arrivalTime: new Date((j.arrival_time || 0) * 1000).toISOString(),
        reason: rcpt.delay_reason || j.queue_name || "queued",
        sizeBytes: j.message_size || 0,
      };
    });
  } catch {
    return [];
  }
}

async function stats() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    cpu: cpuPercent(),
    ram: Math.round(((total - free) / total) * 100),
    disk: await diskPercent(),
    queue: await queueDepth(),
    connections: { smtp: 0, imap: 0 },
  };
}

function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// ── Mail-log shipper ──────────────────────────────────────────────────────
// Tail the Postfix log, parse delivery events, and POST them to the admin-api
// internal ingest endpoint so they appear in the panel's Mail Log view.
const STATUS_MAP = { sent: "delivered", bounced: "bounced", deferred: "deferred", expired: "bounced" };
const senders = new Map(); // queueId -> { sender, size } (from qmgr lines)

// qmgr records the envelope sender + size once per message.
const RE_FROM = /postfix\/(?:qmgr|cleanup)\[\d+\]: ([0-9A-F]{6,}): from=<([^>]*)>(?:, size=(\d+))?/;
// smtp/lmtp/local/virtual record per-recipient delivery outcome.
const RE_DELIV = /postfix\/(?:smtp|lmtp|local|virtual|pipe|error)\[\d+\]: ([0-9A-F]{6,}): to=<([^>]*)>,(?:.*?\srelay=([^,]+),)?.*?\sdelay=([\d.]+),.*?\sstatus=(\w+)\s+\((.*)\)\s*$/;
// outright rejections never get a queue id.
const RE_REJECT = /postfix\/smtpd\[\d+\]: NOQUEUE: reject: RCPT from [^:]+: \d\d\d [\d.]+ <([^>]*)>: ([^;]+);.*?from=<([^>]*)> to=<([^>]*)>/;

async function ship(entry) {
  try {
    await fetch(`${ADMIN_API_URL}/api/v1/internal/logs/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(TOKEN ? { "x-internal-token": TOKEN } : {}) },
      body: JSON.stringify(entry),
    });
  } catch {
    /* admin-api momentarily unreachable — drop this line rather than block. */
  }
}

function parseLine(line) {
  let m = RE_FROM.exec(line);
  if (m) {
    senders.set(m[1], { sender: m[2] || "", size: m[3] ? Number(m[3]) : undefined });
    if (senders.size > 5000) senders.delete(senders.keys().next().value); // bound memory
    return;
  }
  m = RE_DELIV.exec(line);
  if (m) {
    const status = STATUS_MAP[m[5]];
    if (!status) return;
    const info = senders.get(m[1]) || {};
    void ship({
      queueId: m[1],
      sender: info.sender || "",
      recipient: m[2] || "",
      status,
      relay: m[3]?.trim() || undefined,
      delayMs: Math.round(parseFloat(m[4]) * 1000),
      sizeBytes: info.size,
      detail: m[6]?.slice(0, 500),
    });
    if (m[5] === "sent" || m[5] === "bounced") senders.delete(m[1]);
    return;
  }
  m = RE_REJECT.exec(line);
  if (m) {
    void ship({ sender: m[3] || "", recipient: m[4] || "", status: "rejected", detail: m[2]?.trim().slice(0, 500) });
  }
}

async function tailMailLog() {
  let pos = 0;
  let warned = false;
  let buf = "";
  for (;;) {
    try {
      const size = statSync(MAILLOG_FILE).size;
      if (size < pos) pos = 0; // file rotated/truncated
      if (size > pos) {
        const fh = await open(MAILLOG_FILE, "r");
        const { buffer, bytesRead } = await fh.read({ buffer: Buffer.alloc(size - pos), position: pos });
        await fh.close();
        pos = size;
        buf += buffer.subarray(0, bytesRead).toString("utf8");
        const lines = buf.split("\n");
        buf = lines.pop() ?? ""; // keep partial last line
        for (const line of lines) if (line) parseLine(line);
      }
      warned = false;
    } catch (err) {
      if (!warned) { console.error(`[node-agent] mail log tail: ${err.message}`); warned = true; }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const server = createServer(async (req, res) => {
  if (TOKEN && req.headers["x-internal-token"] !== TOKEN) return send(res, 401, { error: "unauthorized" });
  const url = new URL(req.url, "http://agent");
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    if (req.method === "GET" && url.pathname === "/stats") return send(res, 200, await stats());
    if (req.method === "GET" && url.pathname === "/queue") return send(res, 200, await listQueue());
    if (req.method === "POST" && url.pathname === "/queue/flush") {
      await exec("postqueue", ["-f"]);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && parts[0] === "queue" && parts[2] === "retry") {
      await exec("postqueue", ["-i", parts[1]]).catch(() => exec("postsuper", ["-r", parts[1]]));
      return send(res, 200, { ok: true });
    }
    if (req.method === "DELETE" && parts[0] === "queue" && parts[1]) {
      await exec("postsuper", ["-d", parts[1]]);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/quarantine") return send(res, 200, []); // Rspamd-managed; listed via UI later
    return send(res, 404, { error: "not_found" });
  } catch (err) {
    return send(res, 500, { error: String(err) });
  }
});

server.listen(PORT, () => console.log(`[node-agent] listening on :${PORT}`));

// Start shipping Postfix delivery events into mail_log.
tailMailLog();
