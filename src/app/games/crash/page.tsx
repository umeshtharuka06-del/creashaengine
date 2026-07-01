"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { CoinIcon } from "@/components/CoinIcon";
import { AmountInput } from "@/components/AmountInput";

const GROWTH_PER_MS = 0.00015; // must match src/lib/crash-game.ts
const CHIPS = [50, 100, 1000, 10000];
const MIN_BET = 50;

function multiplierAt(elapsedMs: number) {
  if (elapsedMs <= 0) return 1;
  return Math.exp(GROWTH_PER_MS * elapsedMs);
}

interface Round {
  id: string;
  roundId: string;
  period: string;
  state: string;
  crashX: number | null;
  startAt: string;
  settleAt: string;
}
interface MyBet {
  id: string;
  amountFmt: string;
  autoCashoutX: number;
  status: string;
  cashoutX: number | null;
  payoutFmt: string;
}
interface HistRound {
  id: string;
  roundId: string;
  crashX: number | null;
}

export default function CrashGamePage() {
  const [round, setRound] = useState<Round | null>(null);
  const [history, setHistory] = useState<HistRound[]>([]);
  const [myBet, setMyBet] = useState<MyBet | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(true);
  const [amount, setAmount] = useState<number | null>(MIN_BET); // manual stake
  const [display, setDisplay] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState("");
  const cashingRef = useRef(false);

  // ── Auto-bet config (auto-cashout now lives HERE, not in manual betting) ──
  const [abOpen, setAbOpen] = useState(false);
  const [abActive, setAbActive] = useState(false);
  const [base, setBase] = useState<number | null>(MIN_BET);
  const [abAutoX, setAbAutoX] = useState<number | null>(2);
  const [maxRounds, setMaxRounds] = useState<number | null>(0);
  const [stopWins, setStopWins] = useState<number | null>(0);
  const [stopLosses, setStopLosses] = useState<number | null>(0);
  const [incWinPct, setIncWinPct] = useState<number | null>(0);
  const [incLossPct, setIncLossPct] = useState<number | null>(0);
  const [resetWin, setResetWin] = useState(true);
  const [resetLoss, setResetLoss] = useState(false);
  const [delaySec, setDelaySec] = useState<number | null>(0);
  const [stats, setStats] = useState({ rounds: 0, wins: 0, losses: 0, stake: MIN_BET });

  // Single synchronous source of truth for the driver.
  const ab = useRef({
    active: false,
    stake: MIN_BET,
    rounds: 0,
    wins: 0,
    losses: 0,
    placedFor: "",
    counted: "",
    nextBetAt: 0,
    cfg: {
      base: MIN_BET,
      autoX: 2,
      maxRounds: 0,
      stopWins: 0,
      stopLosses: 0,
      incWinPct: 0,
      incLossPct: 0,
      resetWin: true,
      resetLoss: false,
      delayMs: 0,
    },
  });

  const stopAuto = useCallback((reason?: string) => {
    if (!ab.current.active) return;
    ab.current.active = false;
    setAbActive(false);
    if (reason) setMsg(`Auto-bet stopped: ${reason}`);
  }, []);

  const load = useCallback(async () => {
    const res = await api<{
      round: Round;
      history: HistRound[];
      myBet: MyBet | null;
      config?: { autoCashoutEnabled: boolean };
    }>("/api/games/crash/current");
    if (res.ok && res.data) {
      setRound(res.data.round);
      setHistory(res.data.history);
      setMyBet(res.data.myBet);
      if (res.data.config) setAutoCashoutEnabled(res.data.config.autoCashoutEnabled);
    } else {
      stopAuto("connection lost"); // never auto-bet blind
    }
    const me = await api<{ balanceFmt: string }>("/api/auth/me");
    setAuthed(me.ok);
    if (me.ok && me.data) setBalance(me.data.balanceFmt);
    else stopAuto("signed out");
  }, [stopAuto]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 1200);
    const tick = setInterval(() => setNow(Date.now()), 60);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  // SAFETY: never keep auto-betting when the user leaves / hides the tab /
  // goes offline / unmounts.
  useEffect(() => {
    const onVis = () => document.hidden && stopAuto("tab hidden");
    const onOffline = () => stopAuto("offline");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onOffline);
      ab.current.active = false;
    };
  }, [stopAuto]);

  const placeBet = useCallback(
    async (stakeCoins: number, autoMultiplier: number) => {
      setMsg("");
      const res = await api<{ balanceFmt: string }>("/api/games/crash/bet", {
        json: {
          amount: Math.round(stakeCoins * 100),
          autoCashoutX: Math.round(autoMultiplier * 100),
        },
      });
      if (!res.ok) {
        setMsg(res.error || "Bet failed");
        stopAuto("bet rejected"); // e.g. out of funds — don't loop
        return false;
      }
      setBalance(res.data!.balanceFmt);
      load();
      return true;
    },
    [load, stopAuto]
  );

  const doCashout = useCallback(async () => {
    if (cashingRef.current) return;
    cashingRef.current = true;
    const res = await api<{ cashoutX: number; balanceFmt: string }>(
      "/api/games/crash/cashout",
      { method: "POST" }
    );
    if (res.ok && res.data) {
      setBalance(res.data.balanceFmt);
      setMsg(`Cashed out at ${(res.data.cashoutX / 100).toFixed(2)}×`);
    }
    await load();
    cashingRef.current = false;
  }, [load]);

  // live multiplier + client-side auto-cashout (only fires for AUTO bets, which
  // carry an autoCashoutX; manual bets have 0 and are cashed by hand).
  useEffect(() => {
    if (!round) return;
    if (round.state === "RUNNING") {
      const elapsed = now - new Date(round.startAt).getTime();
      const m = multiplierAt(elapsed);
      setDisplay(m);
      if (
        myBet?.status === "PENDING" &&
        myBet.autoCashoutX > 100 &&
        m * 100 >= myBet.autoCashoutX &&
        !cashingRef.current
      ) {
        doCashout();
      }
    } else if (round.state === "SETTLED" && round.crashX) {
      setDisplay(round.crashX / 100);
    } else {
      setDisplay(1);
    }
  }, [now, round, myBet, doCashout]);

  // ── Auto-bet driver ──
  useEffect(() => {
    const s = ab.current;
    if (!s.active || !round) return;

    // Score a finished bet exactly once, adjust stake, apply stop rules.
    if (myBet && myBet.id !== s.counted && (myBet.status === "CASHED" || myBet.status === "LOST")) {
      s.counted = myBet.id;
      s.rounds += 1;
      const grow = (pct: number) => Math.max(MIN_BET, Math.round(s.stake * (1 + pct / 100)));
      if (myBet.status === "CASHED") {
        s.wins += 1;
        s.stake = s.cfg.resetWin ? s.cfg.base : grow(s.cfg.incWinPct);
      } else {
        s.losses += 1;
        s.stake = s.cfg.resetLoss ? s.cfg.base : grow(s.cfg.incLossPct);
      }
      s.nextBetAt = Date.now() + s.cfg.delayMs; // delay between bets
      setStats({ rounds: s.rounds, wins: s.wins, losses: s.losses, stake: s.stake });

      if (s.cfg.maxRounds && s.rounds >= s.cfg.maxRounds) return stopAuto("round limit reached");
      if (s.cfg.stopWins && s.wins >= s.cfg.stopWins) return stopAuto("win target reached");
      if (s.cfg.stopLosses && s.losses >= s.cfg.stopLosses) return stopAuto("loss limit reached");
    }

    // Place the next bet once per betting window, after any configured delay.
    if (round.state === "BETTING" && !myBet && s.placedFor !== round.id && Date.now() >= s.nextBetAt) {
      s.placedFor = round.id;
      placeBet(s.stake, s.cfg.autoX);
    }
  }, [round, myBet, placeBet, stopAuto]);

  function startAuto() {
    if (!autoCashoutEnabled) return;
    if (base === null || base < MIN_BET) return setMsg(`Base bet must be at least ${MIN_BET} coins.`);
    const autoX = abAutoX ?? 0;
    if (autoX < 1.01) return setMsg("Auto cashout must be greater than 1.01×.");
    ab.current = {
      active: true,
      stake: base,
      rounds: 0,
      wins: 0,
      losses: 0,
      placedFor: "",
      counted: myBet?.id ?? "",
      nextBetAt: 0,
      cfg: {
        base,
        autoX,
        maxRounds: maxRounds ?? 0,
        stopWins: stopWins ?? 0,
        stopLosses: stopLosses ?? 0,
        incWinPct: incWinPct ?? 0,
        incLossPct: incLossPct ?? 0,
        resetWin,
        resetLoss,
        delayMs: (delaySec ?? 0) * 1000,
      },
    };
    setStats({ rounds: 0, wins: 0, losses: 0, stake: base });
    setAbActive(true);
    setMsg("Auto-bet started.");
  }

  function manualBet() {
    if (amount === null || amount < MIN_BET) return setMsg(`Minimum bet is ${MIN_BET} coins.`);
    placeBet(amount, 0); // manual = no auto-cashout target; cash out by hand
  }

  const phase = round?.state ?? "…";
  const startMs = round ? new Date(round.startAt).getTime() - now : 0;
  const betCountdown = Math.max(0, Math.ceil(startMs / 1000));
  const crashed = round?.state === "SETTLED";
  const won = myBet?.status === "CASHED";
  const lost = myBet?.status === "LOST";
  const running = round?.state === "RUNNING" && myBet?.status === "PENDING";

  return (
    <div className="grid gap-5 py-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* Multiplier display */}
        <div
          className={`card relative flex h-72 flex-col items-center justify-center overflow-hidden p-6 transition-colors ${
            crashed ? "!border-game-red/40" : ""
          }`}
        >
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background: crashed
                ? "radial-gradient(60% 60% at 50% 50%, rgba(242,59,78,0.22), transparent)"
                : "radial-gradient(60% 60% at 50% 40%, rgba(246,195,67,0.16), transparent)",
            }}
          />
          <div className="relative z-10 text-center">
            <div className="text-xs uppercase tracking-widest text-slate-400">
              {phase === "BETTING"
                ? `Starting in ${betCountdown}s`
                : crashed
                ? "Busted at"
                : "Multiplier"}
            </div>
            <div
              className={`mt-1 font-display font-black tabular-nums leading-none transition-all ${
                crashed ? "text-game-red" : "text-white"
              }`}
              style={{ fontSize: "clamp(3rem, 12vw, 6rem)" }}
            >
              {display.toFixed(2)}×
            </div>
            {won && (
              <div className="mt-2 flex items-center justify-center gap-1 text-game-green">
                ✓ Cashed out at {(myBet!.cashoutX! / 100).toFixed(2)}× · +
                <CoinIcon className="text-game-gold" /> {myBet!.payoutFmt}
              </div>
            )}
            {lost && <div className="mt-2 text-slate-400">Better luck next round</div>}
          </div>
        </div>

        {/* Manual betting — just amount + button */}
        <div className="card p-5">
          {authed === false ? (
            <Link href="/login?next=/games/crash" className="btn-gold">
              Log in to play
            </Link>
          ) : (
            <>
              <label className="mb-1 block text-xs text-slate-400">Bet amount</label>
              <AmountInput
                value={amount}
                onChange={setAmount}
                min={MIN_BET}
                placeholder="Enter amount"
                warning={`Minimum bet is ${MIN_BET} coins.`}
                disabled={abActive}
              />
              <div className="mt-2 flex gap-2">
                {CHIPS.map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    disabled={abActive}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {v}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {running ? (
                  <button onClick={doCashout} className="btn-red flex-1">
                    Cash out <CoinIcon />{" "}
                    {(Number(myBet!.amountFmt.replace(/,/g, "")) * display).toFixed(2)}
                  </button>
                ) : (
                  <button
                    onClick={manualBet}
                    disabled={round?.state !== "BETTING" || !!myBet || abActive}
                    className="btn-gold flex-1"
                  >
                    {myBet
                      ? "Bet placed for this round"
                      : round?.state === "BETTING"
                      ? "Place bet"
                      : "Waiting for next round…"}
                  </button>
                )}
                {balance && (
                  <span className="flex items-center gap-1 text-sm text-slate-300">
                    <CoinIcon className="text-game-gold" />
                    <span className="font-semibold text-game-gold">{balance}</span>
                  </span>
                )}
              </div>
              {msg && <div className="mt-3 text-sm text-slate-300">{msg}</div>}
            </>
          )}
        </div>

        {/* Auto-bet — one professional card; auto-cashout lives here */}
        {authed && autoCashoutEnabled && (
          <div className="card p-5">
            <button
              onClick={() => setAbOpen((o) => !o)}
              className="flex w-full items-center justify-between text-sm font-bold"
            >
              <span>
                Auto bet {abActive && <span className="text-game-green">· running</span>}
              </span>
              <span className="text-game-gold">{abOpen ? "−" : "+"}</span>
            </button>

            {abOpen && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Base bet">
                    <AmountInput value={base} onChange={setBase} min={MIN_BET} disabled={abActive}
                      warning={`Min ${MIN_BET}`} />
                  </Field>
                  <Field label="Auto cashout (×)">
                    <AmountInput value={abAutoX} onChange={setAbAutoX} min={1.01} step={0.1} disabled={abActive}
                      warning="Min 1.01×" />
                  </Field>
                  <Field label="Rounds (0 = ∞)">
                    <AmountInput value={maxRounds} onChange={setMaxRounds} min={0} disabled={abActive} showWarning={false} />
                  </Field>
                  <Field label="Delay between bets (s)">
                    <AmountInput value={delaySec} onChange={setDelaySec} min={0} disabled={abActive} showWarning={false} />
                  </Field>
                  <Field label="Stop after wins (0 = off)">
                    <AmountInput value={stopWins} onChange={setStopWins} min={0} disabled={abActive} showWarning={false} />
                  </Field>
                  <Field label="Stop after losses (0 = off)">
                    <AmountInput value={stopLosses} onChange={setStopLosses} min={0} disabled={abActive} showWarning={false} />
                  </Field>
                  <Field label="Increase on win (%)">
                    <AmountInput value={incWinPct} onChange={setIncWinPct} min={0} disabled={abActive || resetWin} showWarning={false} />
                  </Field>
                  <Field label="Increase on loss (%)">
                    <AmountInput value={incLossPct} onChange={setIncLossPct} min={0} disabled={abActive || resetLoss} showWarning={false} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Toggle label="Reset on win" on={resetWin} disabled={abActive} onClick={() => setResetWin((v) => !v)} />
                  <Toggle label="Reset on loss" on={resetLoss} disabled={abActive} onClick={() => setResetLoss((v) => !v)} />
                </div>

                {abActive && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="chip bg-white/5 text-slate-300">Rounds {stats.rounds}</span>
                    <span className="chip bg-game-green/15 text-game-green">Wins {stats.wins}</span>
                    <span className="chip bg-game-red/15 text-game-red-bright">Losses {stats.losses}</span>
                    <span className="chip bg-white/5 text-slate-300">Next stake {stats.stake}</span>
                  </div>
                )}

                {abActive ? (
                  <button onClick={() => stopAuto("stopped by you")} className="btn-red w-full">
                    Stop auto bet
                  </button>
                ) : (
                  <button onClick={startAuto} className="btn-gold w-full">
                    Start auto bet
                  </button>
                )}
                <p className="text-[11px] text-slate-500">
                  Auto bet stops instantly if you leave the page, switch tabs, lose
                  connection, log out, or run out of funds.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* History */}
      <div className="card h-fit p-4">
        <div className="mb-3 text-sm font-semibold">Recent crashes</div>
        <div className="grid grid-cols-3 gap-2">
          {history.map((h) => {
            const x = h.crashX ? h.crashX / 100 : null;
            const c =
              x === null
                ? "bg-white/5 text-slate-400"
                : x < 2
                ? "bg-game-red/20 text-red-300"
                : x < 10
                ? "bg-royal-blue/20 text-royal-blue-bright"
                : "bg-mega-gold/20 text-game-gold";
            return (
              <div
                key={h.id}
                className={`rounded-lg px-2 py-2 text-center text-sm font-bold ${c}`}
                title={`#${h.roundId}`}
              >
                {x ? `${x.toFixed(2)}×` : "—"}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-semibold transition disabled:opacity-60 ${
        on
          ? "border-game-green/40 bg-game-green/15 text-game-green"
          : "border-white/10 bg-[#0f1626] text-slate-300"
      }`}
    >
      {label}
      <span>{on ? "ON" : "OFF"}</span>
    </button>
  );
}
