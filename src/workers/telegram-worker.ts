// ────────────────────────────────────────────────────────────────────────────
// Telegram Worker — independent process.
//
// Drains the `telegram` queue and performs the outbound Telegram HTTP send via
// the EXISTING `deliverTelegram()` logic, so notifications never block a Next.js
// request. The web app enqueues messages through `sendTelegram()` (unchanged
// call sites). Message content + config handling are untouched.
// ────────────────────────────────────────────────────────────────────────────
import { consume } from "../lib/queue";
import { deliverTelegram } from "../lib/telegram";
import { prisma } from "../lib/db";
import { startHealthServer, newState } from "./health";

const HEALTH_PORT = Number(process.env.TELEGRAM_HEALTH_PORT) || 4101;

const state = newState("telegram-worker");
const ac = new AbortController();

async function main() {
  console.log("[telegram-worker] starting");
  startHealthServer(HEALTH_PORT, state);

  const shutdown = (signal: string) => {
    console.log(`[telegram-worker] stopping (${signal})`);
    state.running = false;
    ac.abort();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await consume(
    "telegram",
    async (job) => {
      const text = (job as { text?: string })?.text;
      if (!text) return;
      await deliverTelegram(text);
      state.processed += 1;
      state.lastEventAt = new Date().toISOString();
    },
    { signal: ac.signal, onError: () => (state.errors += 1) }
  );

  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error("[telegram-worker] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
