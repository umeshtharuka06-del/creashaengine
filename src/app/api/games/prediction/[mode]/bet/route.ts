import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { placePredictionBet, isPredictionMode } from "@/lib/prediction-game";
import { predictionBetSchema, firstError } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/http";
import { getBalance, fmtCoins } from "@/lib/wallet";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ mode: string }> }
) {
  const { mode } = await params;
  const m = mode.toUpperCase();
  if (!isPredictionMode(m)) return fail("Unknown game mode.", 404);

  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);
  if (!rateLimit(`prediction-bet:${user.id}`, 60, 60_000).ok)
    return fail("Slow down.", 429);

  const parsed = predictionBetSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));

  try {
    const bet = await placePredictionBet(
      user.id,
      m,
      parsed.data.selection,
      parsed.data.amount
    );
    const balance = await getBalance(user.id);
    return ok({ betId: bet.id, balance, balanceFmt: fmtCoins(balance) });
  } catch (e) {
    return handleError(e);
  }
}
