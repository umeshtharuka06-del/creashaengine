import { requireUser } from "@/lib/auth";
import { getBalance, fmtCoins } from "@/lib/wallet";
import { ok, fail } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);
  const balance = await getBalance(user.id);
  return ok({
    id: user.id,
    username: user.username,
    email: user.email,
    isAdmin: user.isAdmin,
    clientSeed: user.clientSeed,
    createdAt: user.createdAt.toISOString(),
    balance,
    balanceFmt: fmtCoins(balance),
  });
}
