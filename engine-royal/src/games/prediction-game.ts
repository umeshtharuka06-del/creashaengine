import { prisma } from "../db";
import { applyBalance } from "../wallet";
import { hashSeed, randomServerSeed } from "../fair";
import { getSettingNumber } from "../settings";
import { log } from "../logger";
import {
  decidePredictionResult,
  payoutForBet,
  type PredictionForced,
  type EngineBet,
} from "../engine/prediction-engine";

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
 * Guarantees (see ROOT CAUSE notes in the PR):
 *  • RECOVERY — selects EVERY round whose timer has expired and is not yet
 *    SETTLED, OLDEST FIRST, so a settlement missed on a previous tick is picked
 *    up automatically on the next one. No round can stay BETTING after its
 *    settleAt forever.
 *  • RESILIENCE — one bad bet can no longer poison the whole round. A winner
 *    whose wallet is missing is recorded as LOST (and logged) instead of
 *    aborting the transaction, so the round always reaches SETTLED.
 *  • IDEMPOTENCY / LOCKING — the round is re-read INSIDE the transaction and
 *    skipped if already SETTLED, and only PENDING bets are paid. The final
 *    flip to SETTLED on the round document means two concurrent ticks collide
 *    on that write (MongoDB WriteConflict aborts the loser), so a duplicate
 *    tick can never produce a duplicate payout. `bet.status` is the idempotency
 *    key — a bet is paid at most once because it leaves PENDING in the same
 *    transaction that credits it.
 */
export async function settleDuePredictionRounds(mode: PredictionMode) {
  const now = new Date();
  const due = await prisma.gameRound.findMany({
    where: { game: mode, state: { not: "SETTLED" }, settleAt: { lte: now } },
    include: { bets: true },
    orderBy: { settleAt: "asc" }, // oldest overdue first → drains backlog, no starvation
    take: 50,
  });
  if (due.length === 0) return;

  const { roundMs } = await config(mode);
  const heavyWinRate = (await getSettingNumber("prediction_heavy_win_rate")) || 0.4;
  // Single-player colour fairness knobs (default to the standard 0.4 / no cap).
  const singleColorWinRate =
    (await getSettingNumber("single_player_color_win_rate")) || heavyWinRate;
  const singleColorMaxPayout =
    (await getSettingNumber("single_player_color_max_payout")) || 0;

  if (due.length > 1) {
    log.engine("prediction.settle.backlog", { mode, dueRounds: due.length });
  }

  for (const round of due) {
    // A round overdue by more than one full cycle is a MISSED settlement that we
    // are now recovering — surface it explicitly for observability.
    const lateMs = now.getTime() - round.settleAt.getTime();
    if (lateMs > roundMs) {
      log.settlement("prediction.recovery", {
        mode,
        period: round.period.toString(),
        state: round.state,
        lateMs,
        bets: round.bets.length,
      });
    }

    // Settlement and the house optimizer both price on the EFFECTIVE (post-fee)
    // stake so exposure matches what is actually paid out. Legacy bets (no fee
    // recorded) fall back to the gross amount.
    const engineBets: EngineBet[] = round.bets.map((b) => ({
      selection: b.selection,
      amount: b.effectiveBet > 0 ? b.effectiveBet : b.amount,
    }));
    // Single-player colour fairness only triggers at exactly one distinct player.
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

    try {
      let didSettle = false;
      let unpaidWinners = 0;
      await prisma.$transaction(async (tx) => {
        // Re-read the round + bets INSIDE the tx so we act on fresh state and a
        // concurrent settlement (or an earlier partial attempt) cannot be redone.
        const fresh = await tx.gameRound.findUnique({
          where: { id: round.id },
          include: { bets: true },
        });
        if (!fresh || fresh.state === "SETTLED") return; // already settled — idempotent no-op

        for (const bet of fresh.bets) {
          if (bet.status !== "PENDING") continue; // never repay a non-pending bet
          const stake = bet.effectiveBet > 0 ? bet.effectiveBet : bet.amount;
          const payout = payoutForBet(bet.selection, stake, res.digit);

          if (payout > 0) {
            try {
              await applyBalance(tx, bet.userId, payout, "PAYOUT", bet.id, {
                game: mode,
                digit: res.digit,
              });
              await tx.bet.update({
                where: { id: bet.id },
                data: { status: "WON", payout },
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (msg === "WALLET_NOT_FOUND") {
                // The winner's wallet no longer exists (deleted user / orphaned
                // bet). There is nobody to credit — record it as LOST so the
                // round can still settle instead of being stuck forever.
                await tx.bet.update({
                  where: { id: bet.id },
                  data: { status: "LOST", payout: 0 },
                });
                unpaidWinners += 1;
              } else {
                throw e; // unexpected/transient → abort tx, retried next tick
              }
            }
          } else {
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: "LOST", payout: 0 },
            });
          }
        }

        await tx.gameRound.update({
          where: { id: round.id },
          data: {
            state: "SETTLED",
            settledAt: new Date(),
            // Public-safe result: digit + colours only (no engine internals).
            result: JSON.stringify({
              digit: res.digit,
              colors: res.colors,
              number: res.winningNumber,
            }),
          },
        });
        didSettle = true;
      });

      if (didSettle) {
        log.settlement("prediction.settled", {
          mode,
          period: round.period.toString(),
          digit: res.digit,
          colors: res.colors,
          decisionMode: res.mode,
          uniquePlayers,
          bets: round.bets.length,
          ...(unpaidWinners > 0 ? { unpaidWinners } : {}),
        });
      }
    } catch (e) {
      // Logged, NOT rethrown: the next tick re-selects this round (recovery),
      // and a failure here never blocks the other due rounds in this loop.
      log.error("prediction.settle.failed", {
        mode,
        period: round.period.toString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
