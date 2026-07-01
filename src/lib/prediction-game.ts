import { prisma } from "./db";
import { applyBalance } from "./wallet";
import { getSettingNumber } from "./settings";
import { formatRoundId } from "./round-id";
import { computeFee } from "./fee";

// ────────────────────────────────────────────────────────────────────────────
// WEBSITE (read + bet only) — integrated prediction game.
//
// Round CREATION and SETTLEMENT live in the standalone engine service
// (engine-royal/). The website never creates or settles rounds during a request
// — it only reads the current/recent rounds and places bets against whatever
// round the engine has already opened.
//
// One unified round per mode carries BOTH colour and number bets; a single
// digit 0–9 is drawn and both kinds settle from it.
// ────────────────────────────────────────────────────────────────────────────

export const PREDICTION_MODES = ["PARITY", "SAPRE", "BCONE", "EMERD"] as const;
export type PredictionMode = (typeof PREDICTION_MODES)[number];

export function isPredictionMode(s: string): s is PredictionMode {
  return (PREDICTION_MODES as readonly string[]).includes(s);
}

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

export async function modeRoundMs(mode: PredictionMode): Promise<number> {
  const seconds =
    (await getSettingNumber(MODE_SECONDS_KEY[mode])) || MODE_DEFAULT_SECONDS[mode];
  return seconds * 1000;
}

/** READ-ONLY: round for the current wall-clock period, or null if not opened. */
export async function getCurrentPredictionRound(mode: PredictionMode) {
  const period = BigInt(Math.floor(Date.now() / (await modeRoundMs(mode))));
  return prisma.gameRound.findUnique({
    where: { game_period: { game: mode, period } },
  });
}

type RoundRow = NonNullable<Awaited<ReturnType<typeof getCurrentPredictionRound>>>;

export interface SanitizedRound {
  id: string;
  mode: PredictionMode;
  period: string;
  displayPeriod: string;
  state: string;
  serverSeedHash: string;
  serverSeed: string | null;
  result: { digit: number; colors: string[]; number: number } | null;
  startAt: string;
  lockAt: string;
  settleAt: string;
}

/** Public view — never leaks the unsettled seed or any engine internals. */
export function sanitizeRound(r: RoundRow, roundMs: number): SanitizedRound {
  const settled = r.state === "SETTLED";
  let result: SanitizedRound["result"] = null;
  if (settled && r.result) {
    try {
      const p = JSON.parse(r.result);
      result = { digit: p.digit, colors: p.colors, number: p.number ?? p.digit };
    } catch {
      result = null;
    }
  }
  return {
    id: r.id,
    mode: r.game as PredictionMode,
    period: r.period.toString(),
    displayPeriod: formatRoundId(r.game, r.period),
    state: r.state,
    serverSeedHash: r.serverSeedHash,
    serverSeed: settled ? r.serverSeed : null,
    result,
    startAt: r.startAt.toISOString(),
    lockAt: r.lockAt.toISOString(),
    settleAt: r.settleAt.toISOString(),
  };
}

const COLORS = ["RED", "GREEN", "VIOLET"];

/** A bet selection is a colour OR a single digit "0".."9". */
export function isValidSelection(sel: string): boolean {
  if (COLORS.includes(sel)) return true;
  const n = Number(sel);
  return Number.isInteger(n) && n >= 0 && n <= 9 && sel === String(n);
}

export async function placePredictionBet(
  userId: string,
  mode: PredictionMode,
  selection: string,
  amount: number
) {
  if (!isValidSelection(selection)) throw new Error("INVALID_SELECTION");
  const round = await getCurrentPredictionRound(mode);
  if (!round) throw new Error("ROUND_NOT_READY");
  if (Date.now() >= round.lockAt.getTime()) throw new Error("BETTING_CLOSED");

  const { feeAmount, effectiveBet } = await computeFee(amount);

  return prisma.$transaction(async (tx) => {
    // User is debited the gross stake; the house fee is recorded separately.
    await applyBalance(tx, userId, -amount, "BET", undefined, {
      game: mode,
      selection,
      period: round.period.toString(),
      fee: feeAmount,
    });
    const bet = await tx.bet.create({
      data: { userId, roundId: round.id, game: mode, amount, feeAmount, effectiveBet, selection },
    });
    if (feeAmount > 0) {
      await tx.houseTransaction.create({
        data: { betId: bet.id, userId, game: mode, fee: feeAmount },
      });
    }
    return bet;
  });
}

export async function recentPredictionRounds(mode: PredictionMode, limit = 20) {
  const roundMs = await modeRoundMs(mode);
  const rounds = await prisma.gameRound.findMany({
    where: { game: mode, state: "SETTLED" },
    orderBy: { period: "desc" },
    take: limit,
  });
  return rounds.map((r) => sanitizeRound(r, roundMs));
}
