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

/** Settle every due round of `mode`. Idempotent. */
export async function settleDuePredictionRounds(mode: PredictionMode) {
  const due = await prisma.gameRound.findMany({
    where: { game: mode, state: { not: "SETTLED" }, settleAt: { lte: new Date() } },
    include: { bets: true },
    take: 20,
  });

  const heavyWinRate = (await getSettingNumber("prediction_heavy_win_rate")) || 0.4;

  for (const round of due) {
    const engineBets: EngineBet[] = round.bets.map((b) => ({
      selection: b.selection,
      amount: b.amount,
    }));
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
    });

    try {
      let didSettle = false;
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.gameRound.findUnique({ where: { id: round.id } });
        if (!fresh || fresh.state === "SETTLED") return;

        for (const bet of round.bets) {
          if (bet.status !== "PENDING") continue;
          const payout = payoutForBet(bet.selection, bet.amount, res.digit);
          if (payout > 0) {
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: "WON", payout },
            });
            await applyBalance(tx, bet.userId, payout, "PAYOUT", bet.id, {
              game: mode,
              digit: res.digit,
            });
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
          bets: round.bets.length,
        });
      }
    } catch (e) {
      log.error("prediction.settle.failed", {
        mode,
        period: round.period.toString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
