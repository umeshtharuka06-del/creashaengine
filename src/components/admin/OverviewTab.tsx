"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { CoinIcon } from "@/components/CoinIcon";

interface CashierRow {
  id: string;
  user: string;
  amountUsdt?: number;
  coinsFmt: string;
  address?: string;
  status: string;
  createdAt: string;
}

interface Stats {
  totals: {
    users: number;
    bets: number;
    rounds: number;
    activeUsers24h: number;
    coinsInWalletsFmt: string;
    referrals: number;
  };
  today: {
    users: number;
    depositsCount: number;
    depositsFmt: string;
    withdrawalsCount: number;
    withdrawalsFmt: string;
  };
  queues: { pendingDeposits: number; pendingWithdrawals: number };
  system: { status: string; database: string; serverTime: string };
  last24h: { wageredFmt: string; paidOutFmt: string; ggrFmt: string };
  houseFee: { todayFmt: string; weekFmt: string; monthFmt: string; totalFmt: string };
  live: {
    usersOnline: number;
    todaysBets: number;
    todaysProfitFmt: string;
    todaysLossFmt: string;
    todaysFeeFmt: string;
    currentRound: string;
  };
  roundsByGame: { game: string; rounds: number }[];
  recentBets: {
    id: string;
    user: string;
    game: string;
    amountFmt: string;
    status: string;
    payoutFmt: string;
    createdAt: string;
  }[];
  recentDeposits: CashierRow[];
  recentWithdrawals: CashierRow[];
}

export function OverviewTab() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    const load = () => api<Stats>("/api/admin/stats").then((r) => r.ok && setS(r.data!));
    load();
    const t = setInterval(load, 5000); // live updates, no manual refresh
    return () => clearInterval(t);
  }, []);

  if (!s)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-24 w-full rounded-2xl" />
        ))}
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Live "today" snapshot */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-game-gold">
          Live now
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Users online" value={s.live.usersOnline.toLocaleString()} accent="text-game-green" />
          <Stat label="Today's bets" value={s.live.todaysBets.toLocaleString()} accent="text-white" />
          <Stat label="Today's profit" value={s.live.todaysProfitFmt} coin accent="text-game-green" />
          <Stat label="Today's loss" value={s.live.todaysLossFmt} coin accent="text-game-red-bright" />
          <Stat label="Fee income (today)" value={s.live.todaysFeeFmt} coin accent="text-game-gold" />
          <Stat label="Current round" value={s.live.currentRound} accent="text-royal-blue-bright" />
        </div>
      </div>

      {/* Cashier — today + pending queues */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-game-gold">
          Cashier
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Today's users" value={s.today.users.toLocaleString()} accent="text-game-green" />
          <Stat label="Today's deposits" value={s.today.depositsFmt} coin accent="text-game-gold" sub={`${s.today.depositsCount} approved`} />
          <Stat label="Today's withdrawals" value={s.today.withdrawalsFmt} coin accent="text-royal-blue-bright" sub={`${s.today.withdrawalsCount} paid`} />
          <Stat label="Pending deposits" value={s.queues.pendingDeposits.toLocaleString()} accent={s.queues.pendingDeposits > 0 ? "text-game-gold" : "text-white"} />
          <Stat label="Pending withdrawals" value={s.queues.pendingWithdrawals.toLocaleString()} accent={s.queues.pendingWithdrawals > 0 ? "text-game-red-bright" : "text-white"} />
          <Stat label="Referrals" value={s.totals.referrals.toLocaleString()} accent="text-game-violet" />
        </div>
      </div>

      {/* Primary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total users" value={s.totals.users.toLocaleString()} accent="text-royal-blue-bright" />
        <Stat label="Total bets" value={s.totals.bets.toLocaleString()} accent="text-white" />
        <Stat label="Total rounds" value={s.totals.rounds.toLocaleString()} accent="text-game-violet" />
        <Stat label="Active users (24h)" value={s.totals.activeUsers24h.toLocaleString()} accent="text-game-green" />
      </div>

      {/* Money stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Coins in wallets" value={s.totals.coinsInWalletsFmt} coin accent="text-game-gold" />
        <Stat label="House GGR (24h)" value={s.last24h.ggrFmt} coin accent="text-game-green" />
        <Stat label="Wagered (24h)" value={s.last24h.wageredFmt} coin accent="text-white" />
        <Stat label="Paid out (24h)" value={s.last24h.paidOutFmt} coin accent="text-royal-blue-bright" />
      </div>

      {/* House fee income */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-game-gold">
          House fee income
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Today" value={s.houseFee.todayFmt} coin accent="text-game-gold" />
          <Stat label="This week" value={s.houseFee.weekFmt} coin accent="text-game-gold" />
          <Stat label="This month" value={s.houseFee.monthFmt} coin accent="text-game-gold" />
          <Stat label="All time" value={s.houseFee.totalFmt} coin accent="text-game-gold" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* System status */}
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-slate-400">System status</div>
          <div className="mt-2 flex items-center gap-2 text-lg font-black text-game-green">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-game-green" />
            {s.system.status}
          </div>
          <div className="mt-1 text-xs text-slate-400">Database: {s.system.database}</div>
          <div className="text-xs text-slate-500">
            {new Date(s.system.serverTime).toLocaleString()}
          </div>
        </div>

        {/* Rounds by game */}
        <div className="card p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-wide text-slate-400">Rounds by game</div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {s.roundsByGame.map((g) => (
              <div key={g.game} className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-300">{g.game}</span>
                <span className="font-semibold text-white">{g.rounds.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent cashier activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CashierPanel title="Recent deposits" rows={s.recentDeposits} kind="deposit" />
        <CashierPanel title="Recent withdrawals" rows={s.recentWithdrawals} kind="withdraw" />
      </div>

      {/* Live bet feed */}
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-bold text-white">Live bet feed</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-white/10">
                <th className="py-2 pr-3">User</th>
                <th className="pr-3">Game</th>
                <th className="pr-3">Stake</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Payout</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {s.recentBets.map((b) => (
                <tr key={b.id}>
                  <td className="py-2.5 pr-3 font-medium text-slate-100">{b.user}</td>
                  <td className="pr-3 text-slate-400">{b.game}</td>
                  <td className="whitespace-nowrap pr-3 text-slate-200">
                    <CoinIcon className="text-game-gold" /> {b.amountFmt}
                  </td>
                  <td className="pr-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="whitespace-nowrap pr-3 text-slate-200">
                    <CoinIcon className="text-game-gold" /> {b.payoutFmt}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {new Date(b.createdAt).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  coin,
  sub,
}: {
  label: string;
  value: string;
  accent: string;
  coin?: boolean;
  sub?: string;
}) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 flex items-center gap-1.5 text-2xl font-black ${accent}`}>
        {coin && <CoinIcon className="text-game-gold" />}
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function CashierPanel({ title, rows, kind }: { title: string; rows: CashierRow[]; kind: "deposit" | "withdraw" }) {
  const badge: Record<string, string> = {
    PENDING: "bg-royal-blue/15 text-royal-blue-bright",
    APPROVED: "bg-game-green/15 text-game-green",
    COMPLETED: "bg-game-green/15 text-game-green",
    REJECTED: "bg-game-red/15 text-game-red-bright",
  };
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-bold text-white">{title}</h3>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">No {kind === "deposit" ? "deposits" : "withdrawals"} yet.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100">{r.user}</div>
                <div className="text-[11px] text-slate-500">{new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-sm font-semibold text-game-gold">
                  <CoinIcon /> {r.coinsFmt}
                  {kind === "deposit" && r.amountUsdt != null && (
                    <span className="text-slate-500">· {r.amountUsdt} USDT</span>
                  )}
                </div>
                <span className={`chip ${badge[r.status] ?? "bg-white/5 text-slate-300"}`}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    WON: "bg-game-green/15 text-game-green",
    CASHED: "bg-game-green/15 text-game-green",
    LOST: "bg-white/5 text-slate-400",
    PENDING: "bg-royal-blue/15 text-royal-blue-bright",
  };
  return <span className={`chip ${map[status] ?? "bg-white/5 text-slate-300"}`}>{status}</span>;
}
