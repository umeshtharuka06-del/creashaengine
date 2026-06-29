import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtCoins } from "@/lib/wallet";
import { ok, fail } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  const bets = await prisma.bet.findMany({
    where: { userId: user.id, game: "CRASH" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { round: true },
  });

  return ok(
    bets.map((b) => {
      const settled = b.round.state === "SETTLED";
      const result = settled && b.round.result ? JSON.parse(b.round.result) : null;
      return {
        id: b.id,
        amount: b.amount,
        amountFmt: fmtCoins(b.amount),
        autoCashoutX: parseInt(b.selection, 10) || 0,
        status: b.status,
        cashoutX: b.cashoutX,
        payout: b.payout,
        payoutFmt: fmtCoins(b.payout),
        crashX: result?.crashX ?? null,
        period: b.round.period.toString(),
        createdAt: b.createdAt.toISOString(),
      };
    })
  );
}
