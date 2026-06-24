import { prisma } from "../db";
import { applyBalance } from "../wallet";
import { hashSeed, randomServerSeed } from "../fair";
import { getSettingNumber } from "../settings";
import { log } from "../logger";
import {
  decideNumberResult,
  type NumberForced,
  type EngineBet,
} from "../engine/prediction-engine";

// ── NUMBER round creation + settlement ──
// Identical to the website's src/lib/number-game.ts; only relative imports and
// logging added. Payout (9×) and result logic unchanged.

const GAME = "NUMBER";
export const NUMBER_PAYOUT = 9;

interface NumberConfig {
  roundMs: number;
  lockMs: number;
}

async function config(): Promise<NumberConfig> {
  const seconds = (await getSettingNumber("number_round_seconds")) || 180;
  const lock = (await getSettingNumber("number_lock_seconds")) || 5;
  return { roundMs: seconds * 1000, lockMs: lock * 1000 };
}

export async function ensureCurrentNumberRound() {
  await settleDueNumberRounds();
  const { roundMs, lockMs } = await config();
  const period = BigInt(Math.floor(Date.now() / roundMs));
  const startMs = Number(period) * roundMs;

  const existing = await prisma.gameRound.findUnique({
    where: { game_period: { game: GAME, period } },
  });
  if (existing) return existing;

  const serverSeed = randomServerSeed();
  try {
    const created = await prisma.gameRound.create({
      data: {
        game: GAME,
        period,
        state: "BETTING",
        serverSeed,
        serverSeedHash: hashSeed(serverSeed),
        startAt: new Date(startMs),
        lockAt: new Date(startMs + roundMs - lockMs),
        settleAt: new Date(startMs + roundMs),
      },
    });
    log.engine("number.round.created", { period: period.toString() });
    return created;
  } catch {
    return prisma.gameRound.findUniqueOrThrow({
      where: { game_period: { game: GAME, period } },
    });
  }
}

export async function settleDueNumberRounds() {
  const due = await prisma.gameRound.findMany({
    where: { game: GAME, state: { not: "SETTLED" }, settleAt: { lte: new Date() } },
    include: { bets: true },
    take: 20,
  });

  const heavyWinRate = (await getSettingNumber("prediction_heavy_win_rate")) || 0.4;

  for (const round of due) {
    const engineBets: EngineBet[] = round.bets.map((b) => ({
      selection: b.selection,
      amount: b.amount,
    }));
    let forced: NumberForced | null = null;
    if (round.forcedResult) {
      try {
        forced = JSON.parse(round.forcedResult) as NumberForced;
      } catch {
        forced = null;
      }
    }

    const res = decideNumberResult({
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
          const won = Number(bet.selection) === res.digit;
          if (won) {
            const payout = bet.amount * NUMBER_PAYOUT;
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: "WON", payout },
            });
            await applyBalance(tx, bet.userId, payout, "PAYOUT", bet.id, {
              game: GAME,
              digit: res.digit,
              mult: NUMBER_PAYOUT,
            });
          } else {
            await tx.bet.update({ where: { id: bet.id }, data: { status: "LOST", payout: 0 } });
          }
        }

        await tx.gameRound.update({
          where: { id: round.id },
          data: {
            state: "SETTLED",
            settledAt: new Date(),
            result: JSON.stringify(res),
          },
        });
        didSettle = true;
      });
      if (didSettle) {
        log.settlement("number.settled", {
          period: round.period.toString(),
          digit: res.digit,
          mode: res.mode,
          bets: round.bets.length,
        });
      }
    } catch (e) {
      log.error("number.settle.failed", {
        period: round.period.toString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
