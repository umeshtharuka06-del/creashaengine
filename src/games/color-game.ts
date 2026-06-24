import { prisma } from "../db";
import { applyBalance } from "../wallet";
import { hashSeed, randomServerSeed } from "../fair";
import { getSettingNumber } from "../settings";
import { log } from "../logger";
import {
  decideColorResult,
  type ColorForced,
  type EngineBet,
} from "../engine/prediction-engine";

// ── COLOR round creation + settlement ──
// Logic is identical to the website's original src/lib/color-game.ts. Only
// relative imports and logging were added; result/payout math is unchanged.

const GAME = "COLOR";

interface ColorConfig {
  roundMs: number;
  lockMs: number;
}

async function config(): Promise<ColorConfig> {
  const seconds = (await getSettingNumber("color_round_seconds")) || 60;
  const lock = (await getSettingNumber("color_lock_seconds")) || 5;
  return { roundMs: seconds * 1000, lockMs: lock * 1000 };
}

/** Get-or-create the round for the current wall-clock period. */
export async function ensureCurrentColorRound() {
  await settleDueColorRounds();
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
    log.engine("color.round.created", { period: period.toString() });
    return created;
  } catch {
    // Lost a create race — fetch the winner.
    return prisma.gameRound.findUniqueOrThrow({
      where: { game_period: { game: GAME, period } },
    });
  }
}

const PAYOUT = {
  RED: (digit: number) => (digit === 0 ? 1.5 : 2),
  GREEN: (digit: number) => (digit === 5 ? 1.5 : 2),
  VIOLET: () => 4.5,
} as const;

/** Settle every COLOR round whose time has passed. Idempotent. */
export async function settleDueColorRounds() {
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
    let forced: ColorForced | null = null;
    if (round.forcedResult) {
      try {
        forced = JSON.parse(round.forcedResult) as ColorForced;
      } catch {
        forced = null;
      }
    }

    const res = decideColorResult({
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
          const sel = bet.selection as keyof typeof PAYOUT;
          const won = res.colors.includes(sel as "RED" | "GREEN" | "VIOLET");
          if (won) {
            const mult = PAYOUT[sel](res.digit);
            const payout = Math.floor(bet.amount * mult);
            await tx.bet.update({
              where: { id: bet.id },
              data: { status: "WON", payout },
            });
            await applyBalance(tx, bet.userId, payout, "PAYOUT", bet.id, {
              game: GAME,
              digit: res.digit,
              mult,
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
        log.settlement("color.settled", {
          period: round.period.toString(),
          digit: res.digit,
          colors: res.colors,
          mode: res.mode,
          bets: round.bets.length,
        });
      }
    } catch (e) {
      log.error("color.settle.failed", {
        period: round.period.toString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
