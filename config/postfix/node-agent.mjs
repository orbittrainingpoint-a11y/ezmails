#!/usr/bin/env node
// ezmails node agent — exposes Postfix queue control + host stats over HTTP on the
// internal network. The admin-api (lib/node-agent.ts) is the only caller.
// Auth: x-internal-token header must equal INTERNAL_TOKEN (when set).
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const exec = promisify(execFile);
const PORT = Number(process.env.NODE_AGENT_PORT || 9101);
const TOKEN = process.env.INTERNAL_TOKEN || "";

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
