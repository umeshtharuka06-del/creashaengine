"use client";

import { useCallback, useEffect, useState } from "react";

const PRED_MODES = ["PARITY", "SAPRE", "BCONE", "EMERD"] as const;
const TABS = [...PRED_MODES, "CRASH"] as const;
type Tab = (typeof TABS)[number];

interface PredRound {
  id: string;
  displayPeriod: string;
  result: { digit: number; colors: string[] } | null;
}
interface CrashRound {
  id: string;
  roundId: string;
  crashX: number | null;
}

const LABEL: Record<Tab, string> = {
  PARITY: "Parity",
  SAPRE: "Sapre",
  BCONE: "Bcone",
  EMERD: "Emerd",
  CRASH: "Crash",
};

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("PARITY");
  const [pred, setPred] = useState<PredRound[]>([]);
  const [crash, setCrash] = useState<CrashRound[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (tab === "CRASH") {
      const res = await fetch("/api/games/crash/current", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (body.ok && body.data) setCrash(body.data.history || []);
    } else {
      const res = await fetch(`/api/games/prediction/${tab}/current`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (body.ok && body.data) setPred(body.data.history || []);
    }
    setLoading(false);
  }, [tab]);

  // Live — refresh history without a manual reload.
  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-4 py-2">
      <h1 className="text-lg font-black">Round history</h1>

      {/* Tabs */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {TABS.map((g) => (
          <button
            key={g}
            onClick={() => setTab(g)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === g ? "bg-royal-blue text-white" : "bg-[#1a2438] text-slate-300"
            }`}
          >
            {LABEL[g]}
          </button>
        ))}
      </div>

      <div className="card p-3">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-white/10 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Round ID</span>
          <span className="text-center">{tab === "CRASH" ? "Multiplier" : "Number"}</span>
          <span className="text-right">Result</span>
        </div>

        {loading && (tab === "CRASH" ? crash : pred).length === 0 ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-9 w-full" />
            ))}
          </div>
        ) : tab === "CRASH" ? (
          crash.length === 0 ? (
            <Empty />
          ) : (
            <div className="divide-y divide-white/5">
              {crash.map((r) => {
                const x = r.crashX ? r.crashX / 100 : null;
                return (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2 py-2.5"
                  >
                    <span className="font-mono text-xs text-slate-400">#{r.roundId}</span>
                    <span
                      className={`text-center text-base font-black tabular-nums ${
                        x && x >= 2 ? "text-game-green" : "text-game-red-bright"
                      }`}
                    >
                      {x ? `${x.toFixed(2)}×` : "—"}
                    </span>
                    <span className="text-right text-xs text-slate-500">
                      {x ? (x >= 2 ? "High" : "Low") : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : pred.length === 0 ? (
          <Empty />
        ) : (
          <div className="divide-y divide-white/5">
            {pred.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2 py-2.5"
              >
                <span className="font-mono text-xs text-slate-400">#{r.displayPeriod}</span>
                <span
                  className="grid h-8 w-8 place-items-center justify-self-center rounded-full text-sm font-black text-white"
                  style={{ background: numberBg(r.result?.digit ?? null) }}
                >
                  {r.result?.digit ?? "?"}
                </span>
                <span className="flex justify-end gap-1">
                  {(r.result?.colors ?? []).map((c) => (
                    <span
                      key={c}
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: dotColor(c) }}
                    />
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="py-10 text-center text-sm text-slate-500">No rounds yet.</div>;
}
function dotColor(c: string) {
  return c === "RED" ? "#f2384e" : c === "GREEN" ? "#18b46a" : "#9b6bff";
}
function numberBg(d: number | null) {
  if (d === null) return "#222e47";
  if (d === 0) return "linear-gradient(135deg, #f2384e 0 50%, #9b6bff 50% 100%)";
  if (d === 5) return "linear-gradient(135deg, #18b46a 0 50%, #9b6bff 50% 100%)";
  return d % 2 === 0 ? "#f2384e" : "#18b46a";
}
