"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useUser } from "@/lib/user-context";
import { CoinIcon } from "@/components/CoinIcon";
import { Landing } from "@/components/Landing";
import {
  MegaphoneIcon,
  RocketIcon,
  RechargeIcon,
  WithdrawIcon,
  MODE_ICON,
} from "@/components/icons";

interface Announcement {
  id: string;
  title: string;
  body: string;
}
interface PredRound {
  id: string;
  result: { digit: number } | null;
}

const MODES = [
  { key: "PARITY", label: "Parity", color: "#28c76f" },
  { key: "SAPRE", label: "Sapre", color: "#2f6df6" },
  { key: "BCONE", label: "Bcone", color: "#9b4dff" },
  { key: "EMERD", label: "Emerd", color: "#f6c343" },
] as const;

export default function HomePage() {
  const { me, loading } = useUser();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [results, setResults] = useState<PredRound[]>([]);

  useEffect(() => {
    api<Announcement[]>("/api/announcements").then(
      (r) => r.ok && setAnnouncements(r.data || [])
    );
  }, []);

  // Last 10 results — polled, never more than 10, newest first.
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const r = await api<{ history: PredRound[] }>(
        "/api/games/prediction/PARITY/current"
      );
      if (!stop && r.ok && r.data) setResults(r.data.history.slice(0, 10));
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const ann = announcements[0];

  // Guests get the marketing landing page; players get the dashboard.
  if (!loading && !me) return <Landing />;

  return (
    <div className="app-shell space-y-4 px-3 pb-28 pt-2">
      {/* Announcement banner */}
      <div className="relative overflow-hidden rounded-2xl border border-mega-gold/25 bg-gradient-to-br from-[#1c1606] via-[#141a28] to-[#141a28] p-4">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-mega-gold/20 blur-2xl" />
        <div className="relative flex items-center gap-2 text-sm font-bold text-mega-gold-soft">
          <MegaphoneIcon className="h-4 w-4" />
          <span>{ann ? ann.title : "Welcome to Mega 99"}</span>
        </div>
        <p className="relative mt-1 text-sm text-slate-300">
          {ann ? ann.body : "Predict the colour or number every 3 minutes and win big."}
        </p>
      </div>

      {/* Balance + Deposit / Withdraw */}
      <div className="card overflow-hidden p-4">
        <div className="text-xs uppercase tracking-wide text-slate-400">Balance</div>
        <div className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold tabular-nums">
          <CoinIcon className="text-game-gold" size={28} />
          {me ? me.balanceFmt : "0.00"}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/deposit" className="btn-gold">
            <RechargeIcon className="h-4 w-4" /> Deposit
          </Link>
          <Link href="/withdraw" className="btn-ghost">
            <WithdrawIcon className="h-4 w-4" /> Withdraw
          </Link>
        </div>
      </div>

      {/* Game cards */}
      <section>
        <h2 className="mb-2.5 text-base font-bold">Games</h2>
        <div className="grid grid-cols-2 gap-3">
          {MODES.map((m) => {
            const Icon = MODE_ICON[m.key];
            return (
              <Link
                key={m.key}
                href={`/game?mode=${m.key}`}
                className="card glass-hover flex items-center gap-3 p-4"
              >
                <span
                  className="grid h-11 w-11 place-items-center rounded-xl text-white"
                  style={{ background: m.color }}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <div className="text-base font-bold">{m.label}</div>
                  <div className="text-xs text-slate-400">WinGo · 3 min</div>
                </div>
              </Link>
            );
          })}
        </div>
        <Link
          href="/games/crash"
          className="card glass-hover mt-3 flex items-center gap-3 p-4"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-game-red text-white">
            <RocketIcon className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <div className="text-base font-bold">Crash</div>
            <div className="text-xs text-slate-400">Cash out before it busts</div>
          </div>
          <span className="text-game-gold">→</span>
        </Link>
      </section>

      {/* Last 10 game results */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-base font-bold">Last 10 results</h2>
          <Link href="/game" className="text-xs font-semibold text-game-gold">
            Play →
          </Link>
        </div>
        <div className="card p-4">
          {results.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="skeleton h-9 w-9 rounded-full" />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {results.map((r) => (
                <ResultBall key={r.id} digit={r.result?.digit ?? null} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ResultBall({ digit }: { digit: number | null }) {
  return (
    <span
      className="grid h-9 w-9 place-items-center rounded-full text-sm font-black text-white"
      style={{ background: digit === null ? "#222e47" : numberBg(digit) }}
    >
      {digit ?? "?"}
    </span>
  );
}

function numberBg(d: number) {
  if (d === 0) return "linear-gradient(135deg, #f23b4e 0 50%, #9b4dff 50% 100%)";
  if (d === 5) return "linear-gradient(135deg, #28c76f 0 50%, #9b4dff 50% 100%)";
  return d % 2 === 0 ? "#f23b4e" : "#28c76f";
}
