import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBalance, fmtCoins } from "@/lib/wallet";
import { ok, fail } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  const [balance, txns] = await Promise.all([
    getBalance(user.id),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return ok({
    balance,
    balanceFmt: fmtCoins(balance),
    transactions: txns.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      amountFmt: fmtCoins(t.amount),
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
