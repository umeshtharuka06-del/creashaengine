import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtCoins } from "@/lib/wallet";
import { ok, fail } from "@/lib/http";

// Every recent bet by the current user, across all games (for the "My Win" tab).
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("status") || "ALL").toUpperCase();

  const where: { userId: string; status?: string } = { userId: user.id };
  if (filter === "WON" || filter === "LOST" || filter === "PENDING") {
    where.status = filter;
  }

  const bets = await prisma.bet.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { round: true },
  });

  let won = 0;
  let wagered = 0;
  let returned = 0;
  for (const b of bets) {
    wagered += b.amount;
    if (b.status === "WON") {
      won += 1;
      returned += b.payout;
    }
  }

  return ok({
    summary: {
      total: bets.length,
      won,
      wageredFmt: fmtCoins(wagered),
      returnedFmt: fmtCoins(returned),
    },
    bets: bets.map((b) => {
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
        game: b.game,
        selection: b.selection,
        amountFmt: fmtCoins(b.amount),
        status: b.status,
        payoutFmt: fmtCoins(b.payout),
        period: b.round.period.toString(),
        result,
        createdAt: b.createdAt.toISOString(),
      };
    }),
  });
}
