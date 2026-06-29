"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./client";

export interface PredResult {
  digit: number;
  colors: string[];
  number: number;
}
export interface PredRound {
  id: string;
  mode: string;
  period: string;
  displayPeriod: string;
  state: string;
  serverSeedHash: string;
  serverSeed: string | null;
  result: PredResult | null;
  startAt: string;
  lockAt: string;
  settleAt: string;
}
interface CurrentResp {
  mode: string;
  roundMs: number;
  round: PredRound | null;
  history: PredRound[];
  serverNow: string;
}

/**
 * Real-time round state for one prediction mode.
 *
 * Reliability:
 *  • Countdown is aligned to SERVER time (offset measured from `serverNow`), so
 *    it never drifts from the engine.
 *  • Polling is ADAPTIVE — it speeds up to ~400ms in the last seconds and right
 *    after lock, so the new round + settled result appear within a fraction of a
 *    second instead of waiting for a slow fixed poll. This is what fixes the
 *    "round finished but the page didn't update" problem.
 *  • When a new period opens, `onNewPeriod` fires once (with the just-settled
 *    round) so the page can refresh bets, balance and play the win animation.
 */
export function usePredictionMode(
  mode: string,
  onNewPeriod?: (settled: PredRound | null) => void
) {
  const [data, setData] = useState<CurrentResp | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef(0); // serverNow - clientNow
  const dataRef = useRef<CurrentResp | null>(null);
  const lastPeriod = useRef<string | null>(null);
  const cbRef = useRef(onNewPeriod);
  cbRef.current = onNewPeriod;

  const fetchNow = useCallback(async () => {
    const res = await api<CurrentResp>(`/api/games/prediction/${mode}/current`);
    if (!res.ok || !res.data) return;
    offsetRef.current = new Date(res.data.serverNow).getTime() - Date.now();
    dataRef.current = res.data;
    setData(res.data);

    const p = res.data.round?.period ?? null;
    if (lastPeriod.current !== null && p !== null && p !== lastPeriod.current) {
      cbRef.current?.(res.data.history[0] ?? null);
    }
    if (p !== null) lastPeriod.current = p;
  }, [mode]);

  // Reset when the mode (tab) changes so we don't false-fire onNewPeriod.
  useEffect(() => {
    lastPeriod.current = null;
    dataRef.current = null;
    setData(null);
  }, [mode]);

  // Adaptive polling loop.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const serverMs = () => Date.now() + offsetRef.current;

    const loop = async () => {
      await fetchNow();
      if (stopped) return;
      const d = dataRef.current;
      let delay = 1500;
      if (d?.round) {
        const settleLeft = new Date(d.round.settleAt).getTime() - serverMs();
        const lockLeft = new Date(d.round.lockAt).getTime() - serverMs();
        if (settleLeft <= 2500 || (lockLeft <= 0 && settleLeft > 0)) delay = 400;
        else if (settleLeft <= 6000) delay = 900;
      } else {
        delay = 700; // round not opened yet — check back soon
      }
      timer = setTimeout(loop, delay);
    };

    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [fetchNow]);

  // Smooth clock for the countdown (server-aligned).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offsetRef.current), 100);
    return () => clearInterval(t);
  }, []);

  // SINGLE history updater. The API already orders by period desc, but we
  // additionally dedupe by canonical `period` and re-sort here so the UI can
  // NEVER show a duplicated or out-of-order Period — regardless of poll timing
  // or a transient server hiccup. This is the one and only place history is
  // shaped for rendering.
  const history = useMemo(() => {
    const raw = data?.history ?? [];
    const seen = new Set<string>();
    const out: PredRound[] = [];
    for (const r of raw) {
      if (seen.has(r.period)) continue;
      seen.add(r.period);
      out.push(r);
    }
    out.sort((a, b) =>
      BigInt(a.period) < BigInt(b.period) ? 1 : BigInt(a.period) > BigInt(b.period) ? -1 : 0
    );
    return out;
  }, [data]);

  const round = data?.round ?? null;
  const lockMs = round ? new Date(round.lockAt).getTime() - now : 0;
  const settleMs = round ? new Date(round.settleAt).getTime() - now : 0;
  const locked = lockMs <= 0;
  const secsLeft = Math.max(0, Math.ceil((locked ? settleMs : lockMs) / 1000));
  const phase: "BETTING" | "LOCKED" | "WAITING" = !round
    ? "WAITING"
    : locked
    ? "LOCKED"
    : "BETTING";

  // Fraction of the betting window remaining (for the progress ring).
  let progress = 0;
  if (round) {
    const start = new Date(round.startAt).getTime();
    const lock = new Date(round.lockAt).getTime();
    const span = lock - start || 1;
    progress = Math.max(0, Math.min(1, lockMs / span));
  }

  return {
    data,
    round,
    history,
    roundMs: data?.roundMs ?? 0,
    secsLeft,
    locked,
    phase,
    progress,
    refresh: fetchNow,
  };
}
