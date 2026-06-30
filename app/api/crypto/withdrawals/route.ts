import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { applyBalance, getBalance, fmtCoins, COIN } from "@/lib/wallet";
import { getCryptoConfig, coinsToCents } from "@/lib/crypto/config";
import { cryptoWithdrawSchema, firstError } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { notifyWithdrawRequest } from "@/lib/telegram";
import { enqueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

function serialize(w: {
  id: string;
  address: string;
  coins: number;
  usdt: number;
  feeUsdt: number;
  receiveUsdt: number;
  status: string;
  txid: string | null;
  createdAt: Date;
}) {
  return {
    id: w.id,
    address: w.address,
    coinsFmt: fmtCoins(w.coins),
    usdt: w.usdt,
    feeUsdt: w.feeUsdt,
    receiveUsdt: w.receiveUsdt,
    status: w.status, // PENDING | APPROVED | COMPLETED | REJECTED
    txid: w.txid,
    createdAt: w.createdAt.toISOString(),
  };
}

// The caller's withdrawal history.
export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);
  const rows = await prisma.withdrawal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok(rows.map(serialize));
}

// Create a withdrawal request. Coins are HELD (debited) immediately so the
// balance can't be double-spent while the request is pending; a rejection
// refunds them.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);
  if (!rateLimit(`crypto-withdraw:${user.id}`, 5, 60_000).ok)
    return fail("Too many attempts. Try again later.", 429);

  const cfg = await getCryptoConfig();

  const parsed = cryptoWithdrawSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { address, coins } = parsed.data;

  if (coins < cfg.minWithdrawCoins)
    return fail(`Minimum withdrawal is ${cfg.minWithdrawCoins} coins.`);

  // One open request at a time — prevents duplicate pending withdrawals.
  const open = await prisma.withdrawal.findFirst({
    where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (open) return fail("You already have a withdrawal in progress.", 409);

  const cents = coinsToCents(coins);
  const balance = await getBalance(user.id);
  if (cents > balance) return fail("Amount exceeds your balance.");

  const usdt = coins / cfg.coinsPerUsdt;
  const feeUsdt = cfg.withdrawFeeUsdt;
  const receiveUsdt = +(usdt - feeUsdt).toFixed(6);
  if (receiveUsdt <= 0) return fail("Amount does not cover the withdrawal fee.");

  try {
    const w = await prisma.$transaction(async (tx) => {
      // Debit (hold) the coins now; INSUFFICIENT_FUNDS throws if it would go < 0.
      await applyBalance(tx, user.id, -cents, "WITHDRAWAL", undefined, {
        address,
        usdt,
        feeUsdt,
        receiveUsdt,
      });
      return tx.withdrawal.create({
        data: { userId: user.id, address, coins: cents, usdt, feeUsdt, receiveUsdt, status: "PENDING" },
      });
    });
    await audit("crypto.withdraw.request", { userId: user.id, detail: { id: w.id, coins, address } });
    // Dispatch the operator alert via the dedicated withdraw-queue worker (out of
    // the request path). Fall back to inline notification when the queue is
    // disabled — behaviour is identical to before in that case.
    const notice = {
      username: user.username,
      uid: user.id,
      coins: fmtCoins(w.coins),
      usdt,
      address,
    };
    if (!(await enqueue("withdraw", notice))) {
      await notifyWithdrawRequest(notice);
    }
    const newBalance = await getBalance(user.id);
    return ok({ withdrawal: serialize(w), balance: newBalance, balanceFmt: fmtCoins(newBalance), COIN });
  } catch (e) {
    return handleError(e);
  }
}
