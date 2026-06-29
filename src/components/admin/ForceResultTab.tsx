"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

interface PendingRound {
  id: string;
  roundId: string;
  game: string;
  state: string;
  bets: number;
  forcedResult: { color?: string; digit?: number } | null;
  lockAt: string;
}

const COLORS = ["RED", "GREEN", "VIOLET"] as const;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const PREDICTION = ["PARITY", "SAPRE", "BCONE", "EMERD"];

const COLOR_CLS: Record<string, string> = {
  RED: "bg-game-red text-white",
  GREEN: "bg-game-green text-white",
  VIOLET: "bg-game-violet text-white",
};

export function ForceResultTab() {
  const [rounds, setRounds] = useState<PendingRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<PendingRound[]>("/api/admin/games/force");
    if (res.ok) setRounds(res.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // live
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function force(r: PendingRound, payload: { color?: string; digit?: number }) {
    const res = await api(`/api/admin/games/force`, {
      json: { roundId: r.id, game: r.game, ...payload },
    });
    setMsg({
      text: res.ok
        ? `Forced #${r.roundId} (${r.game}) → ${payload.color ?? payload.digit}`
        : res.error || "Failed to force result",
      ok: res.ok,
    });
    load();
  }

  async function clear(r: PendingRound) {
    const res = await api(`/api/admin/games/force?roundId=${r.id}`, { method: "DELETE" });
    setMsg({ text: res.ok ? `Cleared override on #${r.roundId}` : res.error || "Failed", ok: res.ok });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 text-sm text-slate-400">
        Choose the winning <b className="text-slate-200">colour</b> or{" "}
        <b className="text-slate-200">number</b> for any open round. The engine uses
        your choice when the round settles, overriding the automatic house logic for
        that round only.
      </div>

      {msg && (
        <div
          className={`card p-3 text-sm ${
            msg.ok ? "text-game-green" : "text-game-red-bright"
          }`}
        >
          {msg.text}
        </div>
      )}

      {loading && rounds.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-52 w-full rounded-2xl" />
          ))}
        </div>
      ) : rounds.length === 0 ? (
        <div className="card p-6 text-sm text-slate-400">
          No open rounds right now. They appear here once a betting window opens.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rounds.map((r) => {
            const secsLeft = Math.max(0, Math.ceil((new Date(r.lockAt).getTime() - now) / 1000));
            const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0");
            const ss = String(secsLeft % 60).padStart(2, "0");
            const showColors = r.game === "COLOR" || PREDICTION.includes(r.game);
            const showDigits = r.game === "NUMBER" || PREDICTION.includes(r.game);
            return (
              <div key={r.id} className="card flex flex-col gap-4 p-5">
                {/* Header: game + round id + countdown */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-black text-white">{r.game}</div>
                    <div className="font-mono text-xs text-slate-400">#{r.roundId}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Closes in
                    </div>
                    <div
                      className={`font-mono text-lg font-black tabular-nums ${
                        secsLeft <= 10 ? "text-game-red-bright" : "text-white"
                      }`}
                    >
                      {mm}:{ss}
                    </div>
                  </div>
                </div>

                {/* Meta: bets + forced */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip bg-white/5 text-slate-300">{r.state}</span>
                  <span className="chip bg-white/5 text-slate-300">{r.bets} bets</span>
                  {r.forcedResult && (
                    <span className="chip bg-game-green/15 text-game-green">
                      Forced → {r.forcedResult.color ?? r.forcedResult.digit}
                    </span>
                  )}
                </div>

                {/* Colour buttons */}
                {showColors && (
                  <div className="grid grid-cols-3 gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => force(r, { color: c })}
                        className={`rounded-xl py-2 text-xs font-bold transition active:scale-95 ${
                          COLOR_CLS[c]
                        } ${r.forcedResult?.color === c ? "ring-2 ring-white" : "opacity-90"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {/* Digit buttons */}
                {showDigits && (
                  <div className="grid grid-cols-5 gap-2">
                    {DIGITS.map((d) => (
                      <button
                        key={d}
                        onClick={() => force(r, { digit: d })}
                        className={`grid aspect-square place-items-center rounded-xl bg-[#0f1626] text-sm font-bold text-white transition active:scale-95 ${
                          r.forcedResult?.digit === d ? "ring-2 ring-game-green" : ""
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}

                {r.forcedResult && (
                  <button onClick={() => clear(r)} className="btn-ghost !py-2 text-xs">
                    Clear override
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
