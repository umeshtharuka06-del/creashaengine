import "dotenv/config";
import { tick } from "../src/runner";
import { startHealthServer, type EngineState } from "../src/health";
import { log } from "../src/logger";
import { prisma } from "../src/db";
import * as lc from "../src/lifecycle";

// ── Stall watchdog ──────────────────────────────────────────────────────────
// Any round whose settleAt passed more than ENGINE_STALL_MS ago but is still not
// SETTLED is a STUCK round. We dump its full state (DB row + bet-status breakdown
// + the in-flight operation map showing which stage settlement is wedged at) so
// the exact stop point is provable from the logs. Each stuck round is dumped at
// most once per minute to avoid flooding.
const STALL_MS = Number(process.env.ENGINE_STALL_MS) || 30_000;
const lastDumped = new Map<string, number>();

async function watchdog() {
  const cutoff = new Date(Date.now() - STALL_MS);
  let stuck;
  try {
    stuck = await prisma.gameRound.findMany({
      where: { state: { not: "SETTLED" }, settleAt: { lte: cutoff } },
      orderBy: { settleAt: "asc" },
      take: 20,
    });
  } catch (e) {
    log.dump("engine.watchdog.queryFailed", { error: e instanceof Error ? e.message : String(e) });
    return;
  }
  if (stuck.length === 0) return;

  const now = Date.now();
  const fresh = stuck.filter((r) => now - (lastDumped.get(r.id) ?? 0) > 60_000);
  if (fresh.length === 0) return;

  log.dump("engine.STALL.detected", { stuckRounds: stuck.length, dumping: fresh.length, thresholdMs: STALL_MS });
  for (const r of fresh) {
    lastDumped.set(r.id, now);
    let betStatusCounts: { status: string; count: number }[] = [];
    try {
      const g = await prisma.bet.groupBy({ by: ["status"], where: { roundId: r.id }, _count: { _all: true } });
      betStatusCounts = g.map((s) => ({ status: s.status, count: s._count._all }));
    } catch {
      const all = await prisma.bet.findMany({ where: { roundId: r.id }, select: { status: true }, take: 10_000 });
      const m = new Map<string, number>();
      for (const b of all) m.set(b.status, (m.get(b.status) ?? 0) + 1);
      betStatusCounts = [...m].map(([status, count]) => ({ status, count }));
    }
    log.dump("engine.STALL.round", {
      game: r.game,
      period: r.period.toString(),
      roundId: r.id,
      state: r.state,
      createdAt: r.createdAt.toISOString(),
      settleAt: r.settleAt.toISOString(),
      settledAt: r.settledAt?.toISOString() ?? null,
      result: r.result,
      ageMs: now - r.settleAt.getTime(),
      betStatusCounts,
      inflight: lc.inflightSnapshot(),
    });
  }
}

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
    await watchdog(); // dump any round stuck past settleAt
  } catch (e) {
    log.dump("worker.loop.threw", {
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      inflight: lc.inflightSnapshot(),
    });
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
    log.dump("uncaughtException", { error: e.message, stack: e.stack, inflight: lc.inflightSnapshot() })
  );
  process.on("unhandledRejection", (e) =>
    log.dump("unhandledRejection", {
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      inflight: lc.inflightSnapshot(),
    })
  );
}

main().catch((e) => {
  log.error("worker.fatal", { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
