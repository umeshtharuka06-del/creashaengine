import { prisma } from "../db";
import { applyBalance } from "../wallet";
import { hashSeed, randomServerSeed } from "../fair";
import { crashPoint, durationMsForCrash } from "../engine/crash-engine";
import { getSettingNumber } from "../settings";
import { log } from "../logger";

// ── CRASH round creation + settlement ──
// Identical to the website's src/lib/crash-game.ts (creation/settlement parts);
// only relative imports and logging added. The crash math/payout is unchanged.
// Manual cashout stays on the website (it is a real-time user action).

const GAME = "CRASH";

async function bettingMs(): Promise<number> {
  return ((await getSettingNumber("crash_betting_seconds")) || 8) * 1000;
}

/** Ensure there is an active crash round; create the next one if needed. */
export async function ensureCurrentCrashRound() {
  await settleDueCrashRounds();

  const active = await prisma.gameRound.findFirst({
    where: { game: GAME, state: { in: ["BETTING", "RUNNING"] } },
    orderBy: { period: "desc" },
  });
  if (active) return promoteState(active);

  const last = await prisma.gameRound.findFirst({
    where: { game: GAME },
    orderBy: { period: "desc" },
  });
  const period = (last?.period ?? 0n) + 1n;
  const serverSeed = randomServerSeed();
  const houseEdge = (await getSettingNumber("crash_house_edge_pct")) || 1;
  const crashX = crashPoint(serverSeed, `crash:${period}`, period, houseEdge);

  const now = Date.now();
  const startAt = new Date(now + (await bettingMs()));
  const settleAt = new Date(startAt.getTime() + durationMsForCrash(crashX));

  try {
    const created = await prisma.gameRound.create({
      data: {
        game: GAME,
        period,
        state: "BETTING",
        serverSeed,
        serverSeedHash: hashSeed(serverSeed),
        result: JSON.stringify({ crashX }),
        startAt,
        lockAt: startAt,
        settleAt,
      },
    });
    log.engine("crash.round.created", { period: period.toString(), crashX });
    return created;
  } catch {
    return prisma.gameRound.findFirstOrThrow({
      where: { game: GAME, state: { in: ["BETTING", "RUNNING"] } },
      orderBy: { period: "desc" },
    });
  }
}

/** Flip BETTING→RUNNING once the start time passes (best-effort). */
async function promoteState(r: { id: string; state: string; startAt: Date }) {
  if (r.state === "BETTING" && Date.now() >= r.startAt.getTime()) {
    await prisma.gameRound.update({ where: { id: r.id }, data: { state: "RUNNING" } });
    log.engine("crash.round.running", { id: r.id });
  }
  return prisma.gameRound.findUniqueOrThrow({ where: { id: r.id } });
}

/**
 * Settle every due crash round, oldest first. Same recovery/resilience/idempotency
 * guarantees as prediction settlement: missed settlements are re-picked next tick,
 * a single unpayable bet can't poison the round, and the in-transaction round re-read
 * + SETTLED flip prevents duplicate payouts from overlapping ticks.
 */
export async function settleDueCrashRounds() {
  const now = new Date();
  const due = await prisma.gameRound.findMany({
    where: { game: GAME, state: { in: ["BETTING", "RUNNING"] }, settleAt: { lte: now } },
    include: { bets: true },
    orderBy: { settleAt: "asc" },
    take: 50,
  });
  if (due.length === 0) return;

  if (due.length > 1) {
    log.engine("crash.settle.backlog", { dueRounds: due.length });
  }

  for (const round of due) {
    // Overdue by >10s means we are recovering a missed settlement, not settling
    // a just-expired round — surface it.
    const lateMs = now.getTime() - round.settleAt.getTime();
    if (lateMs > 10_000) {
      log.settlement("crash.recovery", {
        period: round.period.toString(),
        state: round.state,
        lateMs,
        bets: round.bets.length,
      });
    }

    let crashX = 100;
    try {
      if (round.result) crashX = JSON.parse(round.result).crashX ?? 100;
    } catch {
      crashX = 100; // corrupt result blob → treat as instant crash, still settle
    }

    try {
      let didSettle = false;
      let unpaidWinners = 0;
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.gameRound.findUnique({
          where: { id: round.id },
          include: { bets: true },
        });
        if (!fresh || fresh.state === "SETTLED") return;

        for (const bet of fresh.bets) {
          if (bet.status !== "PENDING") continue; // CASHED already credited
          const autoX = parseInt(bet.selection, 10) || 0;
          if (autoX >= 101 && autoX <= crashX) {
            const stake = bet.effectiveBet > 0 ? bet.effectiveBet : bet.amount;
            const payout = Math.floor((stake * autoX) / 100);
            try {
              await applyBalance(tx, bet.userId, payout, "PAYOUT", bet.id, {
                game: GAME,
                autoX,
                crashX,
              });
              await tx.bet.update({
                where: { id: bet.id },
                data: { status: "CASHED", cashoutX: autoX, payout },
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (msg === "WALLET_NOT_FOUND") {
                await tx.bet.update({
                  where: { id: bet.id },
                  data: { status: "LOST", payout: 0 },
                });
                unpaidWinners += 1;
              } else {
                throw e;
              }
            }
          } else {
            await tx.bet.update({ where: { id: bet.id }, data: { status: "LOST", payout: 0 } });
          }
        }

        await tx.gameRound.update({
          where: { id: round.id },
          data: { state: "SETTLED", settledAt: new Date() },
        });
        didSettle = true;
      });
      if (didSettle) {
        log.settlement("crash.settled", {
          period: round.period.toString(),
          crashX,
          bets: round.bets.length,
          ...(unpaidWinners > 0 ? { unpaidWinners } : {}),
        });
      }
    } catch (e) {
      log.error("crash.settle.failed", {
        period: round.period.toString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
