// ────────────────────────────────────────────────────────────────────────────
// Deposit Scanner Worker — independent process.
//
// Replaces the Vercel Cron that used to hit /api/crypto/cron/poll. It calls the
// EXISTING, unchanged `runDepositPoll()` business logic on a loop. The cadence
// follows the admin-configured `crypto_poll_seconds` setting (overridable via
// DEPOSIT_POLL_SECONDS). The poll is idempotent, so overlap is also guarded.
// ────────────────────────────────────────────────────────────────────────────
import { runDepositPoll } from "../lib/crypto/poller";
import { getCryptoConfig } from "../lib/crypto/config";
import { prisma } from "../lib/db";
import { startHealthServer, newState } from "./health";

const HEALTH_PORT = Number(process.env.DEPOSIT_HEALTH_PORT) || 4102;
const OVERRIDE_SECONDS = Math.max(0, Number(process.env.DEPOSIT_POLL_SECONDS) || 0);

const state = newState("deposit-scanner");

let busy = false;
let stopped = false;
let timer: NodeJS.Timeout | null = null;

async function cycle() {
  if (busy) return;
  busy = true;
  try {
    const r = await runDepositPoll();
    state.processed += 1;
    state.lastEventAt = new Date().toISOString();
    if (r.matched || r.credited) {
      console.log(
        `[deposit-scanner] pending=${r.pendingRequests} watched=${r.walletsWatched} matched=${r.matched} credited=${r.credited}`
      );
    }
  } catch (e) {
    state.errors += 1;
    console.error("[deposit-scanner] poll error:", e instanceof Error ? e.message : e);
  } finally {
    busy = false;
  }
}

async function nextDelayMs(): Promise<number> {
  if (OVERRIDE_SECONDS) return OVERRIDE_SECONDS * 1000;
  try {
    const cfg = await getCryptoConfig();
    return Math.max(5, cfg.pollSeconds || 30) * 1000;
  } catch {
    return 30_000;
  }
}

async function schedule() {
  await cycle();
  if (stopped) return;
  timer = setTimeout(schedule, await nextDelayMs());
}

async function main() {
  console.log("[deposit-scanner] starting");
  startHealthServer(HEALTH_PORT, state);
  void schedule();

  const shutdown = (signal: string) => {
    console.log(`[deposit-scanner] stopping (${signal})`);
    stopped = true;
    state.running = false;
    if (timer) clearTimeout(timer);
    prisma.$disconnect().catch(() => {});
    setTimeout(() => process.exit(0), 300);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (e) =>
    console.error("[deposit-scanner] unhandledRejection:", String(e))
  );
}

main().catch((e) => {
  console.error("[deposit-scanner] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
