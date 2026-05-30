import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startWsHub } from "./lib/ws-hub.js";
import { startWorkers, stopMetricsTimer } from "./workers/jobs.js";

async function main() {
  const app = await buildApp();

  // Real-time fan-out hub (needed for the /ws route regardless of workers).
  await startWsHub();

  // Background jobs + metrics broadcast (skippable in tests via ENABLE_WORKERS=false).
  if (env.ENABLE_WORKERS) {
    await startWorkers({
      info: (m) => app.log.info(m),
      error: (e) => app.log.error(e),
    }).catch((e) => app.log.error(e));
  }

  const close = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    stopMetricsTimer();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void close("SIGINT"));
  process.on("SIGTERM", () => void close("SIGTERM"));

  try {
    await app.listen({ port: env.ADMIN_API_PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
