import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtCoins } from "@/lib/wallet";
import { ok, fail } from "@/lib/http";
import { getCurrentPredictionRound } from "@/lib/prediction-game";
import { formatRoundId } from "@/lib/round-id";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const now = Date.now();
  const since = new Date(now - 24 * 60 * 60 * 1000);
  const onlineSince = new Date(now - 5 * 60 * 1000); // "online" = active in last 5 min
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    users,
    bets,
    totalRounds,
    agg,
    wagered24,
    payout24,
    roundsByGame,
    activeUserGroups,
    recentBets,
    feeToday,
    feeWeek,
    feeMonth,
    feeTotal,
    onlineGroups,
    todaysBets,
    wageredTodayAgg,
    paidTodayAgg,
    currentRound,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.bet.count(),
    prisma.gameRound.count(),
    prisma.wallet.aggregate({ _sum: { balance: true } }),
    prisma.bet.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: since } } }),
    prisma.bet.aggregate({ _sum: { payout: true }, where: { createdAt: { gte: since } } }),
    prisma.gameRound.groupBy({ by: ["game"], _count: { _all: true } }),
    prisma.bet.groupBy({ by: ["userId"], where: { createdAt: { gte: since } } }),
    prisma.bet.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { user: { select: { username: true } } },
    }),
    prisma.houseTransaction.aggregate({ _sum: { fee: true }, where: { createdAt: { gte: startOfDay } } }),
    prisma.houseTransaction.aggregate({ _sum: { fee: true }, where: { createdAt: { gte: weekAgo } } }),
    prisma.houseTransaction.aggregate({ _sum: { fee: true }, where: { createdAt: { gte: monthAgo } } }),
    prisma.houseTransaction.aggregate({ _sum: { fee: true } }),
    // ── live "today" + online widgets ──
    prisma.bet.groupBy({ by: ["userId"], where: { createdAt: { gte: onlineSince } } }),
    prisma.bet.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.bet.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: startOfDay } } }),
    prisma.bet.aggregate({ _sum: { payout: true }, where: { createdAt: { gte: startOfDay } } }),
    getCurrentPredictionRound("PARITY").catch(() => null),
  ]);

  const wageredToday = wageredTodayAgg._sum.amount ?? 0;
  const paidToday = paidTodayAgg._sum.payout ?? 0;
  const netToday = wageredToday - paidToday; // house P/L for today

  const wagered = wagered24._sum.amount ?? 0;
  const paid = payout24._sum.payout ?? 0;

  // ── Cashier + funnel metrics for the dashboard ──
  const [
    todaysUsers,
    pendingDeposits,
    pendingWithdrawals,
    depToday,
    wdToday,
    referredCount,
    recentDeposits,
    recentWithdrawals,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.deposit.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    prisma.deposit.aggregate({
      _count: { _all: true },
      _sum: { coins: true },
      where: { status: "APPROVED", createdAt: { gte: startOfDay } },
    }),
    prisma.withdrawal.aggregate({
      _count: { _all: true },
      _sum: { coins: true },
      where: { status: "COMPLETED", createdAt: { gte: startOfDay } },
    }),
    prisma.user.count({ where: { referredBy: { not: null } } }),
    prisma.deposit.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.withdrawal.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  // Usernames for the recent-activity panels (no relation join).
  const cashierUserIds = [
    ...new Set([
      ...recentDeposits.map((d) => d.userId),
      ...recentWithdrawals.map((w) => w.userId),
    ]),
  ];
  const cashierUsers = await prisma.user.findMany({
    where: { id: { in: cashierUserIds } },
    select: { id: true, username: true },
  });
  const cashierName = new Map(cashierUsers.map((u) => [u.id, u.username]));

  return ok({
    totals: {
      users,
      bets,
      rounds: totalRounds,
      activeUsers24h: activeUserGroups.length,
      coinsInWallets: agg._sum.balance ?? 0,
      coinsInWalletsFmt: fmtCoins(agg._sum.balance ?? 0),
      referrals: referredCount,
    },
    today: {
      users: todaysUsers,
      depositsCount: depToday._count._all,
      depositsFmt: fmtCoins(depToday._sum.coins ?? 0),
      withdrawalsCount: wdToday._count._all,
      withdrawalsFmt: fmtCoins(wdToday._sum.coins ?? 0),
    },
    queues: {
      pendingDeposits,
      pendingWithdrawals,
    },
    recentDeposits: recentDeposits.map((d) => ({
      id: d.id,
      user: cashierName.get(d.userId) ?? "—",
      amountUsdt: d.amountUsdt,
      coinsFmt: fmtCoins(d.coins),
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    })),
    recentWithdrawals: recentWithdrawals.map((w) => ({
      id: w.id,
      user: cashierName.get(w.userId) ?? "—",
      coinsFmt: fmtCoins(w.coins),
      address: w.address,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
    })),
    system: {
      status: "Operational",
      database: "Connected",
      serverTime: new Date().toISOString(),
    },
    last24h: {
      wagered,
      wageredFmt: fmtCoins(wagered),
      paidOut: paid,
      paidOutFmt: fmtCoins(paid),
      ggr: wagered - paid, // gross gaming revenue (house)
      ggrFmt: fmtCoins(wagered - paid),
    },
    houseFee: {
      todayFmt: fmtCoins(feeToday._sum.fee ?? 0),
      weekFmt: fmtCoins(feeWeek._sum.fee ?? 0),
      monthFmt: fmtCoins(feeMonth._sum.fee ?? 0),
      totalFmt: fmtCoins(feeTotal._sum.fee ?? 0),
    },
    live: {
      usersOnline: onlineGroups.length, // distinct users active (bet) in last 5 min
      todaysBets,
      todaysProfitFmt: fmtCoins(Math.max(0, netToday)),
      todaysLossFmt: fmtCoins(Math.max(0, -netToday)),
      todaysFeeFmt: fmtCoins(feeToday._sum.fee ?? 0),
      currentRound: currentRound ? formatRoundId("PARITY", currentRound.period) : "—",
    },
    roundsByGame: roundsByGame.map((r) => ({ game: r.game, rounds: r._count._all })),
    recentBets: recentBets.map((b) => ({
      id: b.id,
      user: b.user.username,
      game: b.game,
      amountFmt: fmtCoins(b.amount),
      status: b.status,
      payoutFmt: fmtCoins(b.payout),
      createdAt: b.createdAt.toISOString(),
    })),
  });
}
