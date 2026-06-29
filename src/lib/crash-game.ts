import { prisma } from "./db";
import { applyBalance } from "./wallet";
import { multiplierAt } from "@/engine/crash-engine";
import { formatRoundId } from "./round-id";
import { computeFee } from "./fee";

// ────────────────────────────────────────────────────────────────────────────
// WEBSITE (read + bet + manual cashout).
//
// Round creation, BETTING→RUNNING promotion, and settlement now live in the
// engine service (engine-royal/). The website only reads the active round,
// places bets, and handles MANUAL cash-out — which is a real-time user action
// and therefore cannot move to the scheduled engine. Auto-cashout settlement is
// still done by the engine, exactly as before.
// ────────────────────────────────────────────────────────────────────────────

const GAME = "CRASH";

// Re-export so existing importers keep working unchanged.
export { multiplierAt };

/** READ-ONLY: the active (BETTING/RUNNING) crash round, or null. Never creates,
 *  promotes, or settles — that is the engine's job. */
export async function getCurrentCrashRound() {
  return prisma.gameRound.findFirst({
    where: { game: GAME, state: { in: ["BETTING", "RUNNING"] } },
    orderBy: { period: "desc" },
  });
}

type RoundRow = NonNullable<Awaited<ReturnType<typeof getCurrentCrashRound>>>;

export function sanitizeCrashRound(r: RoundRow) {
  const settled = r.state === "SETTLED";
  const parsed = r.result ? JSON.parse(r.result) : null;
  return {
    id: r.id,
    period: r.period.toString(),
    roundId: formatRoundId("CRASH", r.period),
    state: r.state,
    serverSeedHash: r.serverSeedHash,
    serverSeed: settled ? r.serverSeed : null,
    // crashX only revealed after settlement
    crashX: settled && parsed ? parsed.crashX : null,
    startAt: r.startAt.toISOString(),
    settleAt: r.settleAt.toISOString(),
    serverNow: new Date().toISOString(),
  };
}

export async function placeCrashBet(
  userId: string,
  amount: number,
  autoCashoutX: number // ×100, 0 = manual
) {
  const round = await getCurrentCrashRound();
  if (!round) throw new Error("ROUND_NOT_READY");
  // Betting closes when the running phase starts (lockAt === startAt). Checked
  // by time so it works even if the engine hasn't flipped state to RUNNING yet.
  if (Date.now() >= round.startAt.getTime()) throw new Error("BETTING_CLOSED");

  // one bet per user per round
  const exists = await prisma.bet.findFirst({
    where: { userId, roundId: round.id },
  });
  if (exists) throw new Error("ALREADY_BET");

  const { feeAmount, effectiveBet } = await computeFee(amount);

  return prisma.$transaction(async (tx) => {
    await applyBalance(tx, userId, -amount, "BET", undefined, {
      game: GAME,
      period: round.period.toString(),
      fee: feeAmount,
    });
    const bet = await tx.bet.create({
      data: {
        userId,
        roundId: round.id,
        game: GAME,
        amount,
        feeAmount,
        effectiveBet,
        selection: String(autoCashoutX),
      },
    });
    if (feeAmount > 0) {
      await tx.houseTransaction.create({
        data: { betId: bet.id, userId, game: GAME, fee: feeAmount },
      });
    }
    return bet;
  });
}

export async function cashoutCrash(userId: string) {
  // Latest active round (state may briefly lag the engine's promotion, so we
  // accept BETTING/RUNNING and decide "running" by time below).
  const round = await prisma.gameRound.findFirst({
    where: { game: GAME, state: { in: ["BETTING", "RUNNING"] } },
    orderBy: { period: "desc" },
  });
  if (!round) throw new Error("NO_RUNNING_ROUND");

  const parsed = round.result ? JSON.parse(round.result) : { crashX: 100 };
  const crashX: number = parsed.crashX;
  const now = Date.now();

  // Not started running yet, or already busted.
  if (now < round.startAt.getTime()) throw new Error("NO_RUNNING_ROUND");
  if (now >= round.settleAt.getTime()) throw new Error("ALREADY_CRASHED");

  const elapsed = now - round.startAt.getTime();
  const currentX = Math.min(multiplierAt(elapsed), crashX);

  return prisma.$transaction(async (tx) => {
    const bet = await tx.bet.findFirst({
      where: { userId, roundId: round.id, status: "PENDING" },
    });
    if (!bet) throw new Error("NO_ACTIVE_BET");

    // Payout is computed on the effective (post-fee) stake. Legacy bets created
    // before the fee system fall back to the gross amount.
    const stake = bet.effectiveBet > 0 ? bet.effectiveBet : bet.amount;
    const payout = Math.floor((stake * currentX) / 100);
    await tx.bet.update({
      where: { id: bet.id },
      data: { status: "CASHED", cashoutX: currentX, payout },
    });
    await applyBalance(tx, userId, payout, "PAYOUT", bet.id, {
      game: GAME,
      cashoutX: currentX,
    });
    return { cashoutX: currentX, payout };
  });
}

export async function recentCrashRounds(limit = 20) {
  const rounds = await prisma.gameRound.findMany({
    where: { game: GAME, state: "SETTLED" },
    orderBy: { period: "desc" },
    take: limit,
  });
  return rounds.map(sanitizeCrashRound);
}
