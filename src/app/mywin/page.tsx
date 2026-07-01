"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useUser } from "@/lib/user-context";
import { CoinIcon } from "@/components/CoinIcon";
import { TrophyIcon } from "@/components/icons";

interface Bet {
  id: string;
  game: string;
  selection: string;
  amountFmt: string;
  status: string;
  payoutFmt: string;
  period: string;
  result: { digit: number } | null;
  createdAt: string;
}
interface Summary {
  total: number;
  won: number;
  wageredFmt: string;
  returnedFmt: string;
}

const TABS = ["ALL", "WON", "LOST", "PENDING"] as const;

export default function MyWinPage() {
  const { me, loading } = useUser();
  const [tab, setTab] = useState<(typeof TABS)[number]>("ALL");
  const [bets, setBets] = useState<Bet[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!me) {
      setBusy(false);
      return;
    }
    setBusy(true);
    api<{ summary: Summary; bets: Bet[] }>(`/api/me/bets?status=${tab}`).then((r) => {
      if (r.ok && r.data) {
        setBets(r.data.bets);
        setSummary(r.data.summary);
      }
      setBusy(false);
    });
  }, [tab, me]);

  if (!loading && !me) {
    return (
      <div className="space-y-4 py-10 text-center">
        <TrophyIcon className="mx-auto h-10 w-10 text-game-gold" />
        <div className="text-lg font-bold">Track your wins</div>
        <p className="text-sm text-slate-400">Log in to see your bet history.</p>
        <Link href="/login?next=/mywin" className="btn-blue mx-auto w-40">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <h1 className="px-1 text-lg font-black">My Win</h1>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass p-4">
          <div className="text-xs text-slate-400">Total returned</div>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-black text-game-green">
            <CoinIcon className="text-game-gold" /> {summary?.returnedFmt ?? "0.00"}
          </div>
        </div>
        <div className="glass p-4">
          <div className="text-xs text-slate-400">Total wagered</div>
          <div className="mt-1 flex items-center gap-1.5 text-2xl font-black text-white">
            <CoinIcon className="text-game-gold" /> {summary?.wageredFmt ?? "0.00"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === t ? "bg-royal-blue text-white" : "bg-white/5 text-slate-300"
            }`}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* List */}
      {busy ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      ) : bets.length === 0 ? (
        <div className="glass py-10 text-center text-sm text-slate-500">
          No {tab === "ALL" ? "" : tab.toLowerCase()} bets to show.
        </div>
      ) : (
        <div className="space-y-2">
          {bets.map((b) => (
            <div
              key={b.id}
              className="glass flex animate-slide-up items-center gap-3 p-3"
            >
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5 text-center">
                <span className="text-[9px] uppercase text-slate-400">{b.game.slice(0, 4)}</span>
                <span className="text-sm font-black">{b.result?.digit ?? "-"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{b.selection}</div>
                <div className="text-[11px] text-slate-500">
                  #{b.period} · {new Date(b.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                {b.status === "WON" ? (
                  <span className="flex items-center gap-1 text-sm font-bold text-game-green">
                    +<CoinIcon /> {b.payoutFmt}
                  </span>
                ) : b.status === "LOST" ? (
                  <span className="flex items-center gap-1 text-sm text-slate-500">
                    −<CoinIcon /> {b.amountFmt}
                  </span>
                ) : (
                  <span className="chip bg-royal-blue/20 text-royal-blue-bright">Pending</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
