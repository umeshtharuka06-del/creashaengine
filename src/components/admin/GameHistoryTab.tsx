"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

interface Round {
  id: string;
  roundId: string;
  game: string;
  state: string;
  result: string;
  bets: number;
  settledAt: string | null;
  createdAt: string;
}
interface Pagination {
  page: number;
  totalPages: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

const GAMES = ["ALL", "PARITY", "SAPRE", "BCONE", "EMERD", "CRASH"] as const;

export function GameHistoryTab() {
  const [game, setGame] = useState<(typeof GAMES)[number]>("ALL");
  const [round, setRound] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Round[]>([]);
  const [pg, setPg] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (game !== "ALL") params.set("game", game);
    if (round.trim()) params.set("round", round.trim());
    const res = await api<{ rounds: Round[]; pagination: Pagination }>(
      `/api/admin/history?${params}`
    );
    if (res.ok && res.data) {
      setRows(res.data.rounds);
      setPg(res.data.pagination);
    }
    setLoading(false);
  }, [game, round, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="card space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
          {GAMES.map((g) => (
            <button
              key={g}
              onClick={() => {
                setGame(g);
                setPage(1);
              }}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                game === g ? "bg-royal-blue text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <input
          value={round}
          onChange={(e) => setRound(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
          placeholder="Search round ID…"
          className="input max-w-[200px]"
        />
        <button onClick={() => (setPage(1), load())} className="btn-ghost">
          Search
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              <th className="py-2 pr-3">Round</th>
              <th className="pr-3">Game</th>
              <th className="pr-3">State</th>
              <th className="pr-3">Result</th>
              <th className="pr-3">Bets</th>
              <th>Settled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2.5 pr-3 font-mono text-slate-200">#{r.roundId}</td>
                <td className="pr-3 text-slate-400">{r.game}</td>
                <td className="pr-3">
                  <span
                    className={`chip ${
                      r.state === "SETTLED"
                        ? "bg-game-green/15 text-game-green"
                        : "bg-royal-blue/15 text-royal-blue-bright"
                    }`}
                  >
                    {r.state}
                  </span>
                </td>
                <td className="pr-3 font-medium text-slate-200">{r.result}</td>
                <td className="pr-3 text-slate-400">{r.bets}</td>
                <td className="text-xs text-slate-500">
                  {r.settledAt ? new Date(r.settledAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No rounds found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager pg={pg} loading={loading} onPage={setPage} />
    </div>
  );
}

export function Pager({
  pg,
  loading,
  onPage,
}: {
  pg: Pagination | null;
  loading: boolean;
  onPage: (p: number) => void;
}) {
  if (!pg) return null;
  return (
    <div className="flex items-center justify-between text-sm text-slate-400">
      <span>
        {loading ? "Loading…" : `Page ${pg.page} of ${pg.totalPages} · ${pg.total} total`}
      </span>
      <div className="flex gap-2">
        <button
          disabled={!pg.hasPrev || loading}
          onClick={() => onPage(pg.page - 1)}
          className="btn-ghost"
        >
          ← Prev
        </button>
        <button
          disabled={!pg.hasNext || loading}
          onClick={() => onPage(pg.page + 1)}
          className="btn-ghost"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
