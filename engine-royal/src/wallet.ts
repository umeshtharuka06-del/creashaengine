import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// EXACT copy of the website's src/lib/wallet.ts payout logic.
export const COIN = 100; // 1 coin = 100 coin-cents

export function fmtCoins(cents: number): string {
  return (cents / COIN).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type TxClient = Prisma.TransactionClient;

/**
 * Apply a signed balance change atomically and write a ledger row.
 * Identical to the website implementation so payouts are computed the same way.
 */
export async function applyBalance(
  tx: TxClient,
  userId: string,
  amount: number, // signed coin-cents
  type: string,
  ref?: string,
  meta?: unknown
): Promise<number> {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error("WALLET_NOT_FOUND");
  const next = wallet.balance + amount;
  if (next < 0) throw new Error("INSUFFICIENT_FUNDS");

  await tx.wallet.update({ where: { userId }, data: { balance: next } });
  await tx.transaction.create({
    data: {
      userId,
      type,
      amount,
      balanceAfter: next,
      ref: ref ?? null,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
  return next;
}
