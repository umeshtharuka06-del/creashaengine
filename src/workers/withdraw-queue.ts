// ────────────────────────────────────────────────────────────────────────────
// Withdraw Queue Worker — independent process.
//
// Drains the `withdraw` queue produced by POST /api/crypto/withdrawals and runs
// the operator-alert side-effect out of the request path, via the EXISTING
// `notifyWithdrawRequest()` notifier. The withdrawal *business rules* (balance
// hold, limits, one-open-request, refund-on-reject) remain entirely in the API /
// admin routes — this worker only handles dispatch of the already-created
// request's notification.
// ────────────────────────────────────────────────────────────────────────────
import { consume } from "../lib/queue";
import { notifyWithdrawRequest } from "../lib/telegram";
import { prisma } from "../lib/db";
import { startHealthServer, newState } from "./health";

const HEALTH_PORT = Number(process.env.WITHDRAW_HEALTH_PORT) || 4103;

const state = newState("withdraw-queue");
const ac = new AbortController();

interface WithdrawNotice {
  username: string;
  uid: string;
  coins: string;
  usdt: number;
  address: string;
}

async function main() {
  console.log("[withdraw-queue] starting");
  startHealthServer(HEALTH_PORT, state);

  const shutdown = (signal: string) => {
    console.log(`[withdraw-queue] stopping (${signal})`);
    state.running = false;
    ac.abort();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await consume(
    "withdraw",
    async (job) => {
      const n = job as WithdrawNotice;
      if (!n?.uid) return;
      await notifyWithdrawRequest(n);
      state.processed += 1;
      state.lastEventAt = new Date().toISOString();
    },
    { signal: ac.signal, onError: () => (state.errors += 1) }
  );

  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error("[withdraw-queue] fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
