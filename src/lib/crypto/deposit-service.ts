import { prisma } from "@/lib/db";
import { applyBalance, fmtCoins } from "@/lib/wallet";
import { releaseWallet } from "./wallet-assign";
import { notifyDepositApproved } from "@/lib/telegram";

// ────────────────────────────────────────────────────────────────────────────
// Shared deposit settlement.
//
// One code path credits a PENDING deposit request — used by BOTH the poller
// (auto-detected, on-chain confirmed) and the admin "Approve" action. The status
// guard inside the transaction makes it idempotent, so a request is credited at
// most once even if the poller and an admin act simultaneously.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Credit a PENDING deposit request and mark it APPROVED. Returns true when it
 * actually credited (false if it was already finalised). Releases the user's
 * wallet lock so the next deposit rotates to a new random wallet.
 */
export async function approveDeposit(
  depositId: string,
  opts: { adminId?: string; via: "auto" | "admin"; coinsOverride?: number }
): Promise<boolean> {
  const updated = await prisma.$transaction(async (tx) => {
    const dep = await tx.deposit.findUnique({ where: { id: depositId } });
    if (!dep || dep.status !== "PENDING") return null; // already finalised — no double credit
    const coins = opts.coinsOverride ?? dep.coins;
    await applyBalance(tx, dep.userId, coins, "DEPOSIT", dep.txid ?? undefined, {
      amountUsdt: dep.amountUsdt,
      via: opts.via,
    });
    return tx.deposit.update({
      where: { id: depositId },
      data: {
        status: "APPROVED",
        coins,
        adminId: opts.adminId ?? null,
        creditedAt: new Date(),
        processedAt: new Date(),
      },
    });
  });

  if (!updated) return false;

  await releaseWallet(updated.userId);
  const user = await prisma.user.findUnique({
    where: { id: updated.userId },
    select: { username: true },
  });
  await notifyDepositApproved({
    username: user?.username ?? "—",
    uid: updated.userId,
    coins: fmtCoins(updated.coins),
    wallet: updated.toAddress ?? "",
    via: opts.via,
  });
  return true;
}
