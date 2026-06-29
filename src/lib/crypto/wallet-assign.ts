import { prisma } from "@/lib/db";

// ────────────────────────────────────────────────────────────────────────────
// Per-user deposit-wallet assignment.
//
// A user is randomly assigned ONE active wallet and LOCKED to it (persisted on
// `User.assignedWalletId`) so refreshing, logging out, or logging back in always
// shows the same address. The lock is released only when a deposit is APPROVED,
// so the user's NEXT deposit rotates to a fresh random wallet — users never
// always receive the same wallet.
// ────────────────────────────────────────────────────────────────────────────

export interface AssignedWallet {
  id: string;
  name: string;
  address: string;
  network: string;
}

/**
 * Return the user's currently-locked active wallet, assigning a new random one
 * if they have none (or if the one they held was deactivated/deleted). Returns
 * null when the pool has no active wallets.
 */
export async function getOrAssignWallet(userId: string): Promise<AssignedWallet | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { assignedWalletId: true },
  });
  if (!user) return null;

  // Reuse the existing lock when the wallet is still active.
  if (user.assignedWalletId) {
    const current = await prisma.depositWallet.findUnique({ where: { id: user.assignedWalletId } });
    if (current && current.active) return view(current);
    // else fall through and reassign (wallet was deactivated or deleted)
  }

  const active = await prisma.depositWallet.findMany({ where: { active: true } });
  if (active.length === 0) {
    if (user.assignedWalletId) {
      await prisma.user.update({ where: { id: userId }, data: { assignedWalletId: null } });
    }
    return null;
  }

  const picked = active[Math.floor(Math.random() * active.length)];
  await prisma.user.update({ where: { id: userId }, data: { assignedWalletId: picked.id } });
  return view(picked);
}

/** Release the user's wallet lock so their next deposit reassigns at random. */
export async function releaseWallet(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { assignedWalletId: null } }).catch(() => {});
}

function view(w: { id: string; name: string; address: string; network: string }): AssignedWallet {
  return { id: w.id, name: w.name, address: w.address, network: w.network };
}
