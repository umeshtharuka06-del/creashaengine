import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { placeCrashBet } from "@/lib/crash-game";
import { crashBetSchema, firstError } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/http";
import { getBalance, fmtCoins } from "@/lib/wallet";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);
  if (!rateLimit(`crash-bet:${user.id}`, 30, 60_000).ok)
    return fail("Slow down.", 429);

  const parsed = crashBetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));

  try {
    const bet = await placeCrashBet(
      user.id,
      parsed.data.amount,
      parsed.data.autoCashoutX
    );
    const balance = await getBalance(user.id);
    return ok({ betId: bet.id, balance, balanceFmt: fmtCoins(balance) });
  } catch (e) {
    return handleError(e);
  }
}
