import "dotenv/config";
import { tick } from "../src/runner";
import { startHealthServer, type EngineState } from "../src/health";
import { log } from "../src/logger";
import { prisma } from "../src/db";

/**
 * Main VPS worker. Runs forever:
 *   • every ENGINE_INTERVAL ms → settle due rounds + ensure next rounds exist
 *   • serves GET /health on HEALTH_PORT
 * Start under PM2 (see ecosystem.config.js) so it restarts on crash/reboot.
 */

const INTERVAL = Math.max(250, Number(process.env.ENGINE_INTERVAL) || 1000);
const HEALTH_PORT = Number(process.env.HEALTH_PORT) || 4000;

const state: EngineState = { running: true, lastTickAt: null, ticks: 0 };

let busy = false;
async function loop() {
  if (busy) return; // never overlap ticks
  busy = true;
  try {
    await tick();
    state.ticks += 1;
    state.lastTickAt = new Date().toISOString();
  } finally {
    busy = false;
  }
}

async function main() {
  log.engine("worker.starting", { interval: INTERVAL, healthPort: HEALTH_PORT });
  startHealthServer(HEALTH_PORT, state);

  await loop(); // run one immediately
  const timer = setInterval(loop, INTERVAL);

  async function shutdown(signal: string) {
    log.engine("worker.stopping", { signal });
    state.running = false;
    clearInterval(timer);
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (e) =>
    log.error("uncaughtException", { error: e.message })
  );
  process.on("unhandledRejection", (e) =>
    log.error("unhandledRejection", { error: String(e) })
  );
}

main().catch((e) => {
  log.error("worker.fatal", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
