import { prisma } from "@/lib/db";
import { getCryptoConfig, usdtToCoinCents } from "./config";
import { getNowBlock, getIncomingTransfers, getTxInfo } from "./tron";
import { approveDeposit } from "./deposit-service";

// ────────────────────────────────────────────────────────────────────────────
// Deposit poller — matches on-chain TRC20 USDT transfers to PENDING deposit
// requests and auto-credits them once confirmed.
//
// Unlike the old single-business-wallet poller, this watches ONLY the wallets
// that currently have pending requests, and matches a transfer to a request by
// destination wallet + amount + time (the request must exist before the on-chain
// transfer). The matched request is credited from the ACTUAL on-chain amount
// (never the user's unverified claim).
//
// Safety properties:
//   • Duplicate credit  → status guard in `approveDeposit` (one credit per row).
//   • Replay attack      → a txid already attached to a deposit is skipped.
//   • Wrong token/wallet → re-verified against the contract + assigned address.
//   • Unconfirmed        → credited only at ≥ N confirmations and SUCCESS.
//   • Below minimum      → matched (txid attached) but left for admin review.
// ────────────────────────────────────────────────────────────────────────────

export interface PollResult {
  skipped?: string;
  pendingRequests: number;
  walletsWatched: number;
  seen: number;
  matched: number;
  credited: number;
}

// Match if the request's claimed amount is within ~0.5% (or 0.02 USDT) of the
// actual transfer — tolerant of small rounding while avoiding cross-matching.
function amountsMatch(claimed: number, actual: number): boolean {
  return Math.abs(claimed - actual) <= Math.max(0.02, actual * 0.005);
}

export async function runDepositPoll(): Promise<PollResult> {
  const res: PollResult = {
    pendingRequests: 0,
    walletsWatched: 0,
    seen: 0,
    matched: 0,
    credited: 0,
  };

  const cfg = await getCryptoConfig();
  if (!cfg.usdtContract) return { ...res, skipped: "USDT contract not configured" };

  const pending = await prisma.deposit.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  res.pendingRequests = pending.length;
  if (pending.length === 0) return res;

  const nowBlock = await getNowBlock();

  // ── 1) Match new transfers to not-yet-matched requests (no txid) ──────────
  const unmatched = pending.filter((d) => !d.txid && d.toAddress);
  const byWallet = new Map<string, typeof unmatched>();
  for (const d of unmatched) {
    if (!d.toAddress) continue; // legacy/invalid row without an assigned wallet
    const list = byWallet.get(d.toAddress) ?? [];
    list.push(d);
    byWallet.set(d.toAddress, list);
  }
  res.walletsWatched = byWallet.size;

  for (const [address, requests] of byWallet) {
    let transfers;
    try {
      transfers = await getIncomingTransfers(address, cfg.usdtContract);
    } catch {
      continue; // TronGrid hiccup — retry next poll
    }
    res.seen += transfers.length;

    // oldest first so the earliest request claims a matching transfer
    const queue = [...requests].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const t of transfers) {
      if (t.to !== address) continue; // wrong receiver
      if (t.tokenAddress.toLowerCase() !== cfg.usdtContract.toLowerCase()) continue; // wrong token
      const actualUsdt = Number(t.value) / Math.pow(10, t.decimals || 6);
      if (!Number.isFinite(actualUsdt) || actualUsdt <= 0) continue;

      // Anti-replay: a txid may be attached to at most one deposit.
      const used = await prisma.deposit.findFirst({ where: { txid: t.txid } });
      if (used) continue;

      // Earliest pending request created before the transfer whose amount matches.
      const idx = queue.findIndex(
        (r) => r.createdAt.getTime() <= t.blockTs + 5 * 60_000 && amountsMatch(r.amountUsdt, actualUsdt)
      );
      if (idx === -1) continue;
      const match = queue.splice(idx, 1)[0];

      await prisma.deposit.update({
        where: { id: match.id },
        data: {
          txid: t.txid,
          fromAddress: t.from,
          amountUsdt: actualUsdt, // trust the chain, not the claim
          coins: usdtToCoinCents(actualUsdt, cfg.coinsPerUsdt),
        },
      });
      res.matched++;
    }
  }

  // ── 2) Advance matched (txid set) PENDING requests toward confirmation ────
  const awaiting = await prisma.deposit.findMany({
    where: { status: "PENDING", txid: { not: null } },
    take: 100,
  });

  for (const dep of awaiting) {
    if (!dep.txid) continue;
    let info;
    try {
      info = await getTxInfo(dep.txid);
    } catch {
      continue;
    }
    if (!info) continue; // not indexed yet — retry next poll
    const confirmations = Math.max(0, nowBlock - info.blockNumber);
    await prisma.deposit.update({ where: { id: dep.id }, data: { confirmations } });

    if (!cfg.autoCredit) continue; // manual-approval mode — leave for the admin
    if (!info.success) continue; // reverted tx — admin can reject
    if (confirmations < cfg.confirmations) continue; // wait for more confirmations
    if (dep.amountUsdt < cfg.minDepositUsdt) continue; // below minimum — admin review

    const credited = await approveDeposit(dep.id, { via: "auto" });
    if (credited) res.credited++;
  }

  return res;
}
