import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtCoins } from "@/lib/wallet";
import { ok, fail } from "@/lib/http";
import { isPredictionMode } from "@/lib/prediction-game";

// The current user's recent bets for a single prediction mode.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mode: string }> }
) {
  const { mode } = await params;
  const m = mode.toUpperCase();
  if (!isPredictionMode(m)) return fail("Unknown game mode.", 404);

  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  const bets = await prisma.bet.findMany({
    where: { userId: user.id, game: m },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { round: true },
  });

  return ok(
    bets.map((b) => {
      let result: { digit: number } | null = null;
      if (b.round.result) {
        try {
          result = { digit: JSON.parse(b.round.result).digit };
        } catch {
          result = null;
        }
      }
      return {
        id: b.id,
        selection: b.selection,
        amount: b.amount,
        amountFmt: fmtCoins(b.amount),
        effectiveBet: b.effectiveBet > 0 ? b.effectiveBet : b.amount,
        status: b.status,
        payout: b.payout,
        payoutFmt: fmtCoins(b.payout),
        period: b.round.period.toString(),
        result,
        createdAt: b.createdAt.toISOString(),
      };
    })
  );
}
