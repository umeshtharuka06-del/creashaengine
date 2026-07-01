import { prisma } from "../db";
import { applyBalance } from "../wallet";
import { hashSeed, randomServerSeed } from "../fair";
import { getSettingNumber } from "../settings";
import { log } from "../logger";
import {
  decidePredictionResult,
  payoutForBet,
  colorsOfDigit,
  type PredictionForced,
  type EngineBet,
} from "../engine/prediction-engine";

/** All bet selections that WIN for a given winning digit (colours + the digit). */
function winningSelectionsFor(digit: number): string[] {
  return [...colorsOfDigit(digit), String(digit)];
}

// ── UNIFIED PREDICTION rounds (Color + Number) for the four game modes ──
//
// The 2026 redesign merges Color and Number into one round per mode. Each mode
// (PARITY / SAPRE / BCONE / EMERD) is its own `game` value with its own round
// cadence, so it has an independent round/history stream. A single digit 0–9 is
// drawn per round; colour bets and number bets both settle from it.
//
// This REUSES the existing architecture unchanged: the runner calls
// ensureCurrent*/settleDue* exactly like the old color/number games, the wallet
// ledger and provably-fair seeding are identical, and admin force-results still
// flow through GameRound.forcedResult.

export const PREDICTION_MODES = ["PARITY", "SAPRE", "BCONE", "EMERD"] as const;
export type PredictionMode = (typeof PREDICTION_MODES)[number];

/** Per-mode round length (seconds). Editable in admin → Config. */
const MODE_SECONDS_KEY: Record<PredictionMode, string> = {
  PARITY: "parity_round_seconds",
  SAPRE: "sapre_round_seconds",
  BCONE: "bcone_round_seconds",
  EMERD: "emerd_round_seconds",
};
const MODE_DEFAULT_SECONDS: Record<PredictionMode, number> = {
  PARITY: 180,
  SAPRE: 180,
  BCONE: 180,
  EMERD: 180,
};

async function config(mode: PredictionMode): Promise<{ roundMs: number; lockMs: number }> {
  const seconds =
    (await getSettingNumber(MODE_SECONDS_KEY[mode])) || MODE_DEFAULT_SECONDS[mode];
  const lock = (await getSettingNumber("prediction_lock_seconds")) || 5;
  return { roundMs: seconds * 1000, lockMs: lock * 1000 };
}

/** Get-or-create the round for the current wall-clock period of `mode`. */
export async function ensureCurrentPredictionRound(mode: PredictionMode) {
  await settleDuePredictionRounds(mode);
  const { roundMs, lockMs } = await config(mode);
  const period = BigInt(Math.floor(Date.now() / roundMs));
  const startMs = Number(period) * roundMs;

  const existing = await prisma.gameRound.findUnique({
    where: { game_period: { game: mode, period } },
  });
  if (existing) return existing;

  const serverSeed = randomServerSeed();
  try {
    const created = await prisma.gameRound.create({
      data: {
        game: mode,
        period,
        state: "BETTING",
        serverSeed,
        serverSeedHash: hashSeed(serverSeed),
        startAt: new Date(startMs),
        lockAt: new Date(startMs + roundMs - lockMs),
        settleAt: new Date(startMs + roundMs),
      },
    });
    log.engine("prediction.round.created", { mode, period: period.toString() });
    return created;
  } catch {
    return prisma.gameRound.findUniqueOrThrow({
      where: { game_period: { game: mode, period } },
    });
  }
}

/**
 * Settle every due round of `mode`.
 *
 * TWO-PHASE design — the previous single big `$transaction` (all bets + all
 * wallet credits + the round flip together) blew past Prisma's 5s interactive-
 * transaction timeout once a round had many bets, so under load the transaction
 * aborted (P2028) every tick and the round stayed BETTING forever. We now split
 * the work so the ROUND ALWAYS SETTLES regardless of bet volume:
 *
 *  PHASE A — CLAIM (one fast conditional write, NO wallet I/O): atomically flip
 *    the round to SETTLED and write the result. `updateMany({ where: state != }`)
 *    is a single-document atomic compare-and-set — it IS the lock: only one tick
 *    can win the flip (count 1); a concurrent/duplicate tick sees count 0 and
 *    stops. The round (and its result) become visible to history immediately.
 *
 *  PHASE B — PAYOUTS (drained in small, bounded, idempotent units): losers are
 *    resolved in ONE bulk `updateMany` (no wallet I/O); each winner is paid in
 *    its OWN tiny transaction (one wallet + one ledger row + one bet). `bet.status`
 *    is the idempotency key — a winner leaves PENDING in the same tx that credits
 *    it, and a WriteConflict between two ticks aborts the loser, so no double pay.
 *    A small per-payout transaction can never hit the 5s timeout and barely
 *    contends with live betting.
 *
 *  RECOVERY — any SETTLED round that still has PENDING bets (Phase B interrupted
 *    on an earlier tick) is re-drained every tick, so payouts can never be lost.
 */
export async function settleDuePredictionRounds(mode: PredictionMode) {
  const now = new Date();

  // ── STAGE 1 — find due rounds. This is the ONLY query the critical settle path
  // depends on. It uses ONLY scalar filters (no relation filters that a given
  // Mongo/Prisma build might reject), so it cannot silently break settlement.
  let due;
  try {
    due = await prisma.gameRound.findMany({
      where: { game: mode, state: { not: "SETTLED" }, settleAt: { lte: now } },
      include: { bets: true },
      orderBy: { settleAt: "asc" }, // oldest overdue first → no starvation
      take: 50,
    });
  } catch (e) {
    log.error("prediction.due.query.failed", {
      mode, error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  // Settings are read with safe fallbacks; a failure here must NOT stop settling.
  let roundMs = MODE_DEFAULT_SECONDS[mode] * 1000;
  let heavyWinRate = 0.4;
  let singleColorWinRate = 0.4;
  let singleColorMaxPayout = 0;
  try {
    ({ roundMs } = await config(mode));
    heavyWinRate = (await getSettingNumber("prediction_heavy_win_rate")) || 0.4;
    singleColorWinRate =
      (await getSettingNumber("single_player_color_win_rate")) || heavyWinRate;
    singleColorMaxPayout = (await getSettingNumber("single_player_color_max_payout")) || 0;
  } catch (e) {
    log.error("prediction.settings.failed", {
      mode, error: e instanceof Error ? e.message : String(e),
    });
  }

  if (due.length > 0) {
    log.engine("prediction.settle.due", { mode, dueRounds: due.length });
  }

  // ── STAGE 2 — settle each due round INDEPENDENTLY. One round throwing can never
  // stop the others, and the atomic claim guarantees the round leaves BETTING.
  for (const round of due) {
    try {
      const lateMs = now.getTime() - round.settleAt.getTime();
      if (lateMs > roundMs) {
        log.settlement("prediction.recovery", {
          mode, period: round.period.toString(), state: round.state, lateMs, bets: round.bets.length,
        });
      }

      // Decision is computed OUTSIDE any transaction (pure, deterministic).
      const engineBets: EngineBet[] = round.bets.map((b) => ({
        selection: b.selection,
        amount: b.effectiveBet > 0 ? b.effectiveBet : b.amount,
      }));
      const uniquePlayers = new Set(round.bets.map((b) => b.userId)).size;

      let forced: PredictionForced | null = null;
      if (round.forcedResult) {
        try {
          forced = JSON.parse(round.forcedResult) as PredictionForced;
        } catch {
          forced = null;
        }
      }

      const res = decidePredictionResult({
        bets: engineBets,
        serverSeed: round.serverSeed,
        period: round.period,
        heavyWinRate,
        forced,
        uniquePlayers,
        singleColorWinRate,
        singleColorMaxPayout,
      });
      log.engine("prediction.result.decided", {
        mode, period: round.period.toString(), digit: res.digit, bets: round.bets.length,
      });

      // ── PHASE A — atomic claim + result (one fast conditional write, no wallet
      // I/O, NOT an interactive transaction → cannot hit the 5s timeout). This
      // single write is what guarantees the round can never stay pending.
      const r = await prisma.gameRound.updateMany({
        where: { id: round.id, state: { not: "SETTLED" } },
        data: {
          state: "SETTLED",
          settledAt: new Date(),
          result: JSON.stringify({ digit: res.digit, colors: res.colors, number: res.winningNumber }),
        },
      });

      if (r.count === 0) {
        log.engine("prediction.claim.alreadySettled", { mode, period: round.period.toString() });
      } else {
        log.settlement("prediction.settled", {
          mode, period: round.period.toString(), digit: res.digit, colors: res.colors,
          decisionMode: res.mode, uniquePlayers, bets: round.bets.length,
        });
      }

      // ── PHASE B — drain payouts (bulk losers + per-winner tiny txns) ──
      await payPredictionRoundBets(mode, round.id, res.digit);
    } catch (e) {
      // The round stays not-SETTLED and is re-selected next tick (retry-until-
      // success). Logged with the exact period so the stop point is provable.
      log.error("prediction.settle.round.failed", {
        mode, period: round.period.toString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── STAGE 3 — recover payouts for rounds already SETTLED whose Phase B was
  // interrupted. Fully isolated: it runs AFTER settling and can never break it.
  try {
    await recoverUnpaidPredictionRounds(mode);
  } catch (e) {
    log.error("prediction.payout.recovery.failed", {
      mode, error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Pay out any bet still PENDING inside an ALREADY-SETTLED round (a Phase B that
 * didn't finish on an earlier tick). Uses ONLY basic scalar queries — no relation
 * filters — so it can never throw in a way that would matter to the settle path.
 */
async function recoverUnpaidPredictionRounds(mode: PredictionMode) {
  // PENDING bets belong either to the live (not-yet-settled) round or to a
  // settled-but-undrained round. We group by round and only act on settled ones.
  const pending = await prisma.bet.findMany({
    where: { game: mode, status: "PENDING" },
    select: { roundId: true },
    take: 2000,
  });
  const roundIds = [...new Set(pending.map((b) => b.roundId))];
  if (roundIds.length === 0) return;

  for (const roundId of roundIds) {
    const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!round || round.state !== "SETTLED" || !round.result) continue; // live round → skip
    let digit: number | null = null;
    try {
      digit = JSON.parse(round.result).digit;
    } catch {
      digit = null;
    }
    if (digit == null) {
      log.error("prediction.payout.recovery.noresult", { mode, period: round.period.toString() });
      continue;
    }
    log.settlement("prediction.payout.recovery", { mode, period: round.period.toString() });
    await payPredictionRoundBets(mode, roundId, digit);
  }
}

/**
 * PHASE B — resolve all still-PENDING bets of an already-SETTLED round.
 * Losers settle in one bulk write; each winner is paid in its own tiny, bounded,
 * idempotent transaction so neither a big-transaction timeout nor wallet
 * contention with live betting can stall (or be undone by) settlement.
 */
async function payPredictionRoundBets(mode: PredictionMode, roundId: string, digit: number) {
  const winning = winningSelectionsFor(digit);

  // 1) Losers — single bulk update, no wallet I/O, no contention.
  try {
    await prisma.bet.updateMany({
      where: { roundId, status: "PENDING", selection: { notIn: winning } },
      data: { status: "LOST", payout: 0 },
    });
  } catch (e) {
    log.error("prediction.payout.losers.failed", {
      mode, roundId, error: e instanceof Error ? e.message : String(e),
    });
  }

  // 2) Winners — pay each in its own small transaction.
  const winners = await prisma.bet.findMany({
    where: { roundId, status: "PENDING", selection: { in: winning } },
  });

  let paid = 0;
  let unpaid = 0;
  for (const bet of winners) {
    const stake = bet.effectiveBet > 0 ? bet.effectiveBet : bet.amount;
    const payout = payoutForBet(bet.selection, stake, digit);
    try {
      await prisma.$transaction(
        async (tx) => {
          const fresh = await tx.bet.findUnique({ where: { id: bet.id } });
          if (!fresh || fresh.status !== "PENDING") return; // idempotent: already resolved
          if (payout > 0) {
            await applyBalance(tx, bet.userId, payout, "PAYOUT", bet.id, { game: mode, digit });
            await tx.bet.update({ where: { id: bet.id }, data: { status: "WON", payout } });
          } else {
            await tx.bet.update({ where: { id: bet.id }, data: { status: "LOST", payout: 0 } });
          }
        },
        { timeout: 15_000, maxWait: 5_000 }
      );
      paid += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "WALLET_NOT_FOUND") {
        // Nobody to credit (deleted user / orphaned bet) — mark LOST so the bet
        // leaves PENDING and the round is not re-scanned forever.
        await prisma.bet
          .update({ where: { id: bet.id }, data: { status: "LOST", payout: 0 } })
          .catch(() => {});
        unpaid += 1;
      } else {
        // Transient (WriteConflict / timeout): leave PENDING — the lagging-payout
        // recovery pass retries it next tick. This is exactly where it stopped.
        log.error("prediction.payout.failed", {
          mode, roundId, betId: bet.id, error: msg,
        });
      }
    }
  }

  if (paid > 0 || unpaid > 0) {
    log.settlement("prediction.payouts.done", {
      mode, roundId, winners: winners.length, paid, ...(unpaid > 0 ? { unpaid } : {}),
    });
  }
}
