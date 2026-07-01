import { Prisma } from "@prisma/client";
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
 * Settle every due crash round, oldest first. Same TWO-PHASE design as prediction
 * settlement (see prediction-game.ts): a fast atomic CLAIM flips the round to
 * SETTLED in one conditional write (no wallet I/O — so no 5s transaction-timeout
 * under load), then payouts drain in bulk (losers) + small idempotent per-winner
 * transactions. SETTLED rounds with leftover PENDING bets are recovered each tick.
 */
const crashXOf = (round: { result: string | null }): number => {
  try {
    return round.result ? JSON.parse(round.result).crashX ?? 100 : 100;
  } catch {
    return 100; // corrupt result blob → treat as instant crash, still settle
  }
};

export async function settleDueCrashRounds() {
  const now = new Date();

  // STAGE 1 — due rounds only (scalar filters, no relation filters).
  let due;
  try {
    due = await prisma.gameRound.findMany({
      where: { game: GAME, state: { in: ["BETTING", "RUNNING"] }, settleAt: { lte: now } },
      orderBy: { settleAt: "desc" }, // newest due first (see prediction-game note); backlog still drains
      take: 50,
    });
  } catch (e) {
    log.error("crash.due.query.failed", { error: e instanceof Error ? e.message : String(e) });
    return;
  }
  if (due.length > 0) log.engine("crash.settle.due", { dueRounds: due.length });

  // STAGE 2 — settle each round independently; atomic claim guarantees progress.
  for (const round of due) {
    try {
      const lateMs = now.getTime() - round.settleAt.getTime();
      if (lateMs > 10_000) {
        log.settlement("crash.recovery", {
          period: round.period.toString(), state: round.state, lateMs,
        });
      }
      const crashX = crashXOf(round);

      const r = await prisma.gameRound.updateMany({
        where: { id: round.id, state: { in: ["BETTING", "RUNNING"] } },
        data: { state: "SETTLED", settledAt: new Date() },
      });
      if (r.count > 0) log.settlement("crash.settled", { period: round.period.toString(), crashX });
      else log.engine("crash.claim.alreadySettled", { period: round.period.toString() });

      await payCrashRoundBets(round.id, crashX);
    } catch (e) {
      log.error("crash.settle.round.failed", {
        period: round.period.toString(), error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // STAGE 3 — isolated payout recovery (no relation filters).
  try {
    await recoverUnpaidCrashRounds();
  } catch (e) {
    log.error("crash.payout.recovery.failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Drain payouts for already-SETTLED crash rounds whose Phase B was interrupted. */
async function recoverUnpaidCrashRounds() {
  const pending = await prisma.bet.findMany({
    where: { game: GAME, status: "PENDING" },
    select: { roundId: true },
    take: 2000,
  });
  const roundIds = [...new Set(pending.map((b) => b.roundId))];
  for (const roundId of roundIds) {
    const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!round || round.state !== "SETTLED") continue; // live round → skip
    log.settlement("crash.payout.recovery", { period: round.period.toString() });
    await payCrashRoundBets(roundId, crashXOf(round));
  }
}

/**
 * PHASE B for crash — resolve still-PENDING bets of a SETTLED round. Crash win
 * condition is numeric (auto-cashout X in hundredths must be ≤ crashX), so we
 * classify in JS, bulk-mark losers by id, and pay winners in tiny idempotent txns.
 */
async function payCrashRoundBets(roundId: string, crashX: number) {
  // Paginate the round's bets by id (≤ BATCH at a time) so memory stays bounded
  // no matter how many bets a heavy round has. Losers are bulk-marked per page;
  // winners are paid in tiny idempotent transactions.
  const BATCH = 500;
  let winnersCount = 0;
  let paid = 0;
  let unpaid = 0;
  let cursor: string | undefined = undefined;

  while (true) {
    // Fixed set (all bets of the round) so the cursor row never changes filter
    // membership; per-bet status is checked below for idempotency.
    const args: Prisma.BetFindManyArgs = {
      where: { roundId },
      orderBy: { id: "asc" },
      take: BATCH,
    };
    if (cursor) { args.cursor = { id: cursor }; args.skip = 1; }
    const page = await prisma.bet.findMany(args);
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    const winners: typeof page = [];
    const loserIds: string[] = [];
    for (const bet of page) {
      if (bet.status !== "PENDING") continue; // CASHED (manual) / already resolved
      const autoX = parseInt(bet.selection, 10) || 0;
      if (autoX >= 101 && autoX <= crashX) winners.push(bet);
      else loserIds.push(bet.id);
    }

    if (loserIds.length) {
      try {
        await prisma.bet.updateMany({
          where: { id: { in: loserIds }, status: "PENDING" },
          data: { status: "LOST", payout: 0 },
        });
      } catch (e) {
        log.error("crash.payout.losers.failed", {
          roundId, error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    for (const bet of winners) {
      winnersCount += 1;
      const autoX = parseInt(bet.selection, 10) || 0;
      const stake = bet.effectiveBet > 0 ? bet.effectiveBet : bet.amount;
      const payout = Math.floor((stake * autoX) / 100);
      try {
        await prisma.$transaction(
          async (tx) => {
            const fresh = await tx.bet.findUnique({ where: { id: bet.id } });
            if (!fresh || fresh.status !== "PENDING") return; // idempotent
            await applyBalance(tx, bet.userId, payout, "PAYOUT", bet.id, { game: GAME, autoX, crashX });
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: "CASHED", cashoutX: autoX, payout },
            });
          },
          { timeout: 15_000, maxWait: 5_000 }
        );
        paid += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "WALLET_NOT_FOUND") {
          await prisma.bet
            .update({ where: { id: bet.id }, data: { status: "LOST", payout: 0 } })
            .catch(() => {});
          unpaid += 1;
        } else {
          log.error("crash.payout.failed", { roundId, betId: bet.id, error: msg });
        }
      }
    }

    if (page.length < BATCH) break;
  }

  if (paid > 0 || unpaid > 0) {
    log.settlement("crash.payouts.done", {
      roundId, winners: winnersCount, paid, ...(unpaid > 0 ? { unpaid } : {}),
    });
  }
}
