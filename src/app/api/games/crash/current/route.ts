import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getCurrentCrashRound,
  sanitizeCrashRound,
  recentCrashRounds,
} from "@/lib/crash-game";
import { fmtCoins } from "@/lib/wallet";
import { getSetting } from "@/lib/settings";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

// READ-ONLY. The engine service (engine-royal/) creates/promotes/settles crash
// rounds; the website only reads the active round and the caller's bet.
export async function GET() {
  const round = await getCurrentCrashRound();
  const history = await recentCrashRounds(10);

  // include the caller's bet on this round, if any
  let myBet = null;
  const user = await requireUser();
  if (user && round) {
    const bet = await prisma.bet.findFirst({
      where: { userId: user.id, roundId: round.id },
    });
    if (bet)
      myBet = {
        id: bet.id,
        amount: bet.amount,
        amountFmt: fmtCoins(bet.amount),
        autoCashoutX: parseInt(bet.selection, 10) || 0,
        status: bet.status,
        cashoutX: bet.cashoutX,
        payout: bet.payout,
        payoutFmt: fmtCoins(bet.payout),
      };
  }

  const autoCashoutEnabled = (await getSetting("crash_auto_cashout_enabled")) !== "false";

  return ok({
    round: round ? sanitizeCrashRound(round) : null,
    history,
    myBet,
    config: { autoCashoutEnabled },
  });
}
