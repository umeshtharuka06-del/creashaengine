import { requireUser } from "@/lib/auth";
import { cashoutCrash } from "@/lib/crash-game";
import { ok, fail, handleError } from "@/lib/http";
import { getBalance, fmtCoins } from "@/lib/wallet";

export async function POST() {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  try {
    const res = await cashoutCrash(user.id);
    const balance = await getBalance(user.id);
    return ok({ ...res, balance, balanceFmt: fmtCoins(balance) });
  } catch (e) {
    return handleError(e);
  }
}
