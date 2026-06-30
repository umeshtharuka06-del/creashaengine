import { getCryptoConfig } from "@/lib/crypto/config";
import { getOrAssignWallet } from "@/lib/crypto/wallet-assign";
import { requireUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

// Public crypto config for the deposit/withdraw pages. Visiting this endpoint
// (which the deposit page does on load) assigns + locks a random active wallet
// to the caller and returns it. Deposits are always available; if no active
// wallet exists the deposit page shows an "unavailable" notice.
export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  const cfg = await getCryptoConfig();
  const wallet = await getOrAssignWallet(user.id);

  return ok({
    network: wallet?.network ?? "TRC20",
    wallet: wallet
      ? { id: wallet.id, name: wallet.name, address: wallet.address, network: wallet.network }
      : null,
    minDepositUsdt: cfg.minDepositUsdt,
    minWithdrawCoins: cfg.minWithdrawCoins,
    withdrawFeeUsdt: cfg.withdrawFeeUsdt,
    coinsPerUsdt: cfg.coinsPerUsdt,
    confirmations: cfg.confirmations,
  });
}
