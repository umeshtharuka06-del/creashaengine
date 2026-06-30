import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtCoins } from "@/lib/wallet";
import { getCryptoConfig, usdtToCoinCents } from "@/lib/crypto/config";
import { getOrAssignWallet } from "@/lib/crypto/wallet-assign";
import { cryptoDepositSchema, firstError } from "@/lib/validation";
import { ok, fail } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { notifyDepositRequest } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function serialize(d: {
  id: string;
  toAddress: string | null;
  network: string;
  amountUsdt: number;
  coins: number;
  txid: string | null;
  confirmations: number;
  status: string;
  createdAt: Date;
}) {
  return {
    id: d.id,
    toAddress: d.toAddress ?? "",
    network: d.network,
    amountUsdt: d.amountUsdt,
    coinsFmt: fmtCoins(d.coins),
    txid: d.txid,
    confirmations: d.confirmations,
    status: d.status, // PENDING | APPROVED | REJECTED
    createdAt: d.createdAt.toISOString(),
  };
}

// The caller's deposit-request history (newest first).
export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  const rows = await prisma.deposit.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok(rows.map(serialize));
}

// Create a deposit request ("I Have Paid"). The user has already (claimed to
// have) sent USDT to their assigned wallet. The poller will try to match the
// on-chain transfer; an admin can also approve/reject manually.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);
  if (!rateLimit(`crypto-deposit:${user.id}`, 5, 60_000).ok)
    return fail("Too many attempts. Try again later.", 429);

  const parsed = cryptoDepositSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { amountUsdt, txid } = parsed.data;

  const cfg = await getCryptoConfig();
  if (amountUsdt < cfg.minDepositUsdt)
    return fail(`Minimum deposit is ${cfg.minDepositUsdt} USDT.`);

  // Duplicate-payment protection: one open request at a time.
  const open = await prisma.deposit.findFirst({
    where: { userId: user.id, status: "PENDING" },
  });
  if (open)
    return fail("You already have a pending deposit. Wait for it to be verified first.", 409);

  // If the user supplied a TXID, make sure it isn't already used anywhere.
  if (txid) {
    const dupe = await prisma.deposit.findFirst({ where: { txid } });
    if (dupe) return fail("That transaction id has already been submitted.", 409);
  }

  const wallet = await getOrAssignWallet(user.id);
  if (!wallet) return fail("Deposits are temporarily unavailable. Please try again later.", 503);

  const coins = usdtToCoinCents(amountUsdt, cfg.coinsPerUsdt);
  const deposit = await prisma.deposit.create({
    data: {
      userId: user.id,
      walletId: wallet.id,
      toAddress: wallet.address,
      network: wallet.network,
      amountUsdt,
      coins,
      txid: txid ?? null,
      status: "PENDING",
    },
  });

  await audit("crypto.deposit.request", {
    userId: user.id,
    detail: { id: deposit.id, amountUsdt, wallet: wallet.address, txid },
  });
  await notifyDepositRequest({
    username: user.username,
    uid: user.id,
    amountUsdt,
    coins: fmtCoins(coins),
    wallet: wallet.address,
  });

  return ok(serialize(deposit));
}
