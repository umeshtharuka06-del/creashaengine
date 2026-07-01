import "dotenv/config";
import { prisma } from "../src/db";

// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY live lifecycle tracer for the PRODUCTION database.
//
// Run this ALONGSIDE the real engine (it never writes, never settles — only
// findMany/findFirst/groupBy) to watch, in real time, whether rounds progress
// BETTING → SETTLED and to dump any round that stops.
//
//   DATABASE_URL="<prod mongodb uri>" npm run trace         (from engine-royal/)
//
// For each game it prints, on every state change:
//   • newestRound   — highest-period round (and its state)
//   • newestSettled — highest-period SETTLED round  (== the top of the history API)
//   • gap           — newestRound.period − newestSettled.period
//                     healthy ≈ 1 (current round still BETTING); a large gap means
//                     rounds are stuck and NOT settling.
//   • stuck         — rounds past settleAt by > ENGINE_STALL_MS, still not SETTLED
// Every stuck round is dumped in full (row + bet-status breakdown).
// ─────────────────────────────────────────────────────────────────────────────

const GAMES = ["PARITY", "SAPRE", "BCONE", "EMERD", "CRASH"];
const STALL_MS = Number(process.env.ENGINE_STALL_MS) || 30_000;
const INTERVAL = Number(process.env.TRACE_INTERVAL_MS) || 1_000;

const lastLine = new Map<string, string>();
const fmt = (r: { period: bigint; state: string } | null) =>
  r ? `${r.period.toString()}(${r.state})` : "none";

async function betStatusCounts(roundId: string) {
  try {
    const g = await prisma.bet.groupBy({ by: ["status"], where: { roundId }, _count: { _all: true } });
    return g.map((s) => ({ status: s.status, count: s._count._all }));
  } catch {
    const all = await prisma.bet.findMany({ where: { roundId }, select: { status: true }, take: 10_000 });
    const m = new Map<string, number>();
    for (const b of all) m.set(b.status, (m.get(b.status) ?? 0) + 1);
    return [...m].map(([status, count]) => ({ status, count }));
  }
}

async function pollGame(game: string) {
  const [newestRound, newestSettled, stuck] = await Promise.all([
    prisma.gameRound.findFirst({ where: { game }, orderBy: { period: "desc" } }),
    prisma.gameRound.findFirst({ where: { game, state: "SETTLED" }, orderBy: { period: "desc" } }),
    prisma.gameRound.findMany({
      where: { game, state: { not: "SETTLED" }, settleAt: { lte: new Date(Date.now() - STALL_MS) } },
      orderBy: { settleAt: "asc" },
      take: 10,
    }),
  ]);

  const gap =
    newestRound && newestSettled
      ? (BigInt(newestRound.period) - BigInt(newestSettled.period)).toString()
      : "?";
  const line = `[${game}] newestRound=${fmt(newestRound)} newestSettled=${fmt(newestSettled)} gap=${gap} stuck=${stuck.length}`;
  if (lastLine.get(game) !== line) {
    console.log(new Date().toISOString(), line);
    lastLine.set(game, line);
  }

  for (const r of stuck) {
    console.log(
      "  !! STALL " +
        JSON.stringify({
          game,
          roundId: r.id,
          period: r.period.toString(),
          state: r.state,
          createdAt: r.createdAt.toISOString(),
          settleAt: r.settleAt.toISOString(),
          settledAt: r.settledAt?.toISOString() ?? null,
          result: r.result,
          ageMs: Date.now() - r.settleAt.getTime(),
          bets: await betStatusCounts(r.id),
        })
    );
  }
}

async function poll() {
  for (const game of GAMES) {
    try {
      await pollGame(game);
    } catch (e) {
      console.error(`poll error [${game}]:`, e instanceof Error ? e.message : String(e));
    }
  }
}

async function main() {
  console.log(
    "read-only lifecycle tracer — DB:",
    (process.env.DATABASE_URL || "(unset)").replace(/\/\/[^@]*@/, "//***@")
  );
  console.log(`polling every ${INTERVAL}ms; stall threshold ${STALL_MS}ms. Ctrl-C to stop.`);
  await poll();
  const t = setInterval(() => poll().catch((e) => console.error("poll error:", e)), INTERVAL);
  process.on("SIGINT", async () => {
    clearInterval(t);
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
}

main().catch(async (e) => {
  console.error("tracer fatal:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
