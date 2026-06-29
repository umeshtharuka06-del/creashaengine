"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useUser } from "@/lib/user-context";
import { usePredictionMode, type PredRound } from "@/lib/use-prediction";
import { CoinIcon } from "@/components/CoinIcon";
import { TrophyIcon } from "@/components/icons";
import { AmountInput } from "@/components/AmountInput";

const MODES = [
  { key: "PARITY", label: "Parity", sub: "3 min" },
  { key: "SAPRE", label: "Sapre", sub: "3 min" },
  { key: "BCONE", label: "Bcone", sub: "3 min" },
  { key: "EMERD", label: "Emerd", sub: "3 min" },
] as const;

// Only these four stake chips. Minimum (and default) stake is 50 coins.
const CHIPS = [50, 100, 1000, 10000];
const MIN_BET = 50;

interface MyBet {
  id: string;
  selection: string;
  amount: number; // coin-cents (gross)
  amountFmt: string;
  effectiveBet: number; // coin-cents after house fee
  status: string;
  payoutFmt: string;
  period: string;
  result: { digit: number } | null;
}

export default function GamePage() {
  const [mode, setMode] = useState<string>("PARITY");
  const { me, refresh: refreshUser, setBalanceFmt } = useUser();
  const [myBets, setMyBets] = useState<MyBet[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  // null = field emptied; we never snap a default back while typing.
  const [amount, setAmount] = useState<number | null>(MIN_BET);

  // Preselect the mode from ?mode= (set by the home game cards).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("mode")?.toUpperCase();
    if (q && MODES.some((m) => m.key === q)) setMode(q);
  }, []);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [win, setWin] = useState<{ amount: string; digit: number } | null>(null);
  const seenSettled = useRef<Set<string>>(new Set());

  const loadMine = useCallback(async () => {
    const res = await api<MyBet[]>(`/api/games/prediction/${mode}/history`);
    if (res.ok) setMyBets(res.data || []);
  }, [mode]);

  // When a round settles (new period opens): refresh bets + balance, detect win.
  const onNewPeriod = useCallback(
    async (settled: PredRound | null) => {
      await Promise.all([loadMine(), refreshUser()]);
      if (!settled?.result) return;
      const res = await api<MyBet[]>(`/api/games/prediction/${mode}/history`);
      if (!res.ok || !res.data) return;
      setMyBets(res.data);
      const wonForRound = res.data.filter(
        (b) =>
          b.period === settled.period &&
          b.status === "WON" &&
          !seenSettled.current.has(b.id)
      );
      wonForRound.forEach((b) => seenSettled.current.add(b.id));
      if (wonForRound.length) {
        const total = wonForRound.reduce(
          (a, b) => a + parseFloat(b.payoutFmt.replace(/,/g, "")),
          0
        );
        setWin({ amount: total.toLocaleString("en-US", { minimumFractionDigits: 2 }), digit: settled.result.digit });
      }
    },
    [loadMine, refreshUser, mode]
  );

  const game = usePredictionMode(mode, onNewPeriod);

  useEffect(() => {
    setSelection(null);
    setMsg(null);
    loadMine();
  }, [mode, loadMine]);

  async function placeBet() {
    if (!selection) {
      setMsg({ text: "Pick a color or a number first.", ok: false });
      return;
    }
    // Validate on submit only — the field is allowed to be empty while typing.
    if (amount === null || amount < MIN_BET) {
      setMsg({ text: `Minimum bet is ${MIN_BET} coins.`, ok: false });
      return;
    }
    setMsg(null);
    const res = await api<{ balanceFmt: string; balance: number }>(
      `/api/games/prediction/${mode}/bet`,
      { json: { selection, amount: Math.round(amount * 100) } }
    );
    if (!res.ok) {
      setMsg({ text: res.error || "Bet failed", ok: false });
      return;
    }
    setBalanceFmt(res.data!.balanceFmt, res.data!.balance);
    setMsg({ text: `Bet placed: ${labelFor(selection)} · ${amount} coins`, ok: true });
    loadMine();
  }

  // Only the bets on the CURRENTLY ACTIVE round (pending). After settlement the
  // round's period changes and the bet's status flips, so this list empties
  // automatically — we never keep showing old/lost bets.
  const currentBets = game.round
    ? myBets.filter((b) => b.period === game.round!.period && b.status === "PENDING")
    : [];

  const mm = String(Math.floor(game.secsLeft / 60)).padStart(2, "0");
  const ss = String(game.secsLeft % 60).padStart(2, "0");
  const urgent = game.secsLeft <= 10 && game.phase === "BETTING";

  return (
    <div className="space-y-4 py-2">
      {/* Mode tabs */}
      <div className="grid grid-cols-4 gap-2">
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`rounded-2xl border px-1 py-2.5 text-center transition active:scale-95 ${
                active
                  ? "border-transparent bg-gradient-to-br from-royal-blue to-game-violet text-white shadow-glow"
                  : "border-white/10 bg-white/5 text-slate-300"
              }`}
            >
              <div className="text-sm font-bold">{m.label}</div>
              <div className={`text-[10px] ${active ? "text-white/80" : "text-slate-500"}`}>
                {m.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Round + countdown header */}
      <div className="glass relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-royal-blue/20 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="chip border border-white/10 bg-white/5 text-slate-300">
              <TrophyIcon className="h-3.5 w-3.5 text-game-gold" /> {modeLabel(mode)}
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-400">
              Period
            </div>
            <div className="font-mono text-base font-bold tabular-nums text-white">
              {game.round?.displayPeriod ?? "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              {game.phase === "BETTING"
                ? "Closes in"
                : game.phase === "LOCKED"
                ? "Drawing"
                : "Loading"}
            </div>
            <div
              className={`mt-1 flex gap-1 ${urgent ? "animate-pulse-glow" : ""}`}
            >
              {[mm[0], mm[1], ":", ss[0], ss[1]].map((c, i) => (
                <span
                  key={i}
                  className={
                    c === ":"
                      ? "text-2xl font-black text-slate-400"
                      : `grid h-9 w-7 place-items-center rounded-lg text-2xl font-black tabular-nums ${
                          urgent
                            ? "bg-royal-red text-white"
                            : "bg-ink-700 text-white"
                        }`
                  }
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-game-green via-royal-blue to-game-violet transition-all duration-300"
            style={{ width: `${game.progress * 100}%` }}
          />
        </div>

        {/* Last 5 results inline */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Recent</span>
          <div className="flex gap-1.5">
            {game.history.slice(0, 6).map((h) => (
              <DigitBall key={h.id} digit={h.result?.digit ?? null} size="sm" />
            ))}
          </div>
        </div>
      </div>

      {/* Betting panel */}
      <div className="glass p-4">
        {/* Colors */}
        <div className="grid grid-cols-3 gap-2.5">
          <ColorButton
            label="Green"
            pay="2× / 1.5×"
            active={selection === "GREEN"}
            onClick={() => setSelection("GREEN")}
            cls="from-game-green to-game-green-deep"
          />
          <ColorButton
            label="Violet"
            pay="4.5×"
            active={selection === "VIOLET"}
            onClick={() => setSelection("VIOLET")}
            cls="from-game-violet to-game-violet-deep"
          />
          <ColorButton
            label="Red"
            pay="2× / 1.5×"
            active={selection === "RED"}
            onClick={() => setSelection("RED")}
            cls="from-game-red to-game-red-deep"
          />
        </div>

        {/* Numbers 0–9 */}
        <div className="mt-4 grid grid-cols-5 gap-2.5">
          {Array.from({ length: 10 }, (_, d) => (
            <button
              key={d}
              onClick={() => setSelection(String(d))}
              className={`relative grid aspect-square place-items-center rounded-2xl text-xl font-black transition active:scale-95 ${
                selection === String(d)
                  ? "ring-2 ring-white ring-offset-2 ring-offset-ink-800"
                  : ""
              }`}
              style={{ background: numberBg(d) }}
            >
              <span className="drop-shadow">{d}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 text-center text-[11px] text-slate-500">
          Numbers pay 9× on an exact match
        </div>

        {/* Chips + free-typed amount (any value; never snaps back) */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {CHIPS.map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition active:scale-95 ${
                  amount === v
                    ? "border-game-gold bg-game-gold/15 text-game-gold"
                    : "border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <AmountInput
            value={amount}
            onChange={setAmount}
            min={MIN_BET}
            placeholder="Enter amount"
            warning={`Minimum bet is ${MIN_BET} coins.`}
          />
        </div>

        {/* Place bet */}
        <div className="mt-4">
          {me === null ? (
            <Link href="/login?next=/game" className="btn-blue w-full">
              Log in to play
            </Link>
          ) : (
            <button
              onClick={placeBet}
              disabled={game.phase !== "BETTING"}
              className="btn-blue w-full !py-4 text-base"
            >
              {game.phase === "LOCKED"
                ? "Betting closed — drawing…"
                : game.phase === "WAITING"
                ? "Preparing round…"
                : !selection
                ? "Select color or number"
                : amount === null
                ? "Enter a bet amount"
                : `Bet ${amount} on ${labelFor(selection)}`}
            </button>
          )}
        </div>
        {msg && (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-sm ${
              msg.ok
                ? "bg-game-green/15 text-game-green"
                : "bg-game-red/15 text-game-red-bright"
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>

      {/* Current bet — ONLY the active round's pending bet(s). Disappears after
          settlement; no scrolling through old/lost bets. */}
      {me && currentBets.length > 0 && (
        <div className="card p-4">
          <div className="mb-3 text-sm font-bold">Current bet</div>
          <div className="space-y-2">
            {currentBets.map((b) => (
              <div
                key={b.id}
                className="flex animate-slide-up items-center gap-3 rounded-xl bg-white/5 px-3 py-3"
              >
                <SelectionBadge selection={b.selection} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{labelFor(b.selection)}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    Stake <CoinIcon className="text-game-gold" /> {b.amountFmt}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-sm font-bold text-game-green">
                    +<CoinIcon className="text-game-gold" /> {potentialWin(b)}
                  </div>
                  <div className="text-[11px] text-royal-blue-bright">Waiting…</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History / chart */}
      <div className="glass p-4">
        <div className="mb-3 text-sm font-bold">{modeLabel(mode)} record</div>
        <div className="overflow-hidden rounded-2xl border border-white/5">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Period</span>
            <span className="text-center">Number</span>
            <span className="text-right">Result</span>
          </div>
          <div className="divide-y divide-white/5">
            {game.history.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="px-3 py-2.5">
                    <div className="skeleton h-5 w-full" />
                  </div>
                ))
              : game.history.map((h) => (
                  <div
                    key={h.period}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2.5"
                  >
                    <span className="font-mono text-xs text-slate-400">
                      {h.displayPeriod}
                    </span>
                    <span className="text-center text-lg font-black tabular-nums">
                      {h.result?.digit ?? "?"}
                    </span>
                    <span className="flex justify-end gap-1">
                      {(h.result?.colors ?? []).map((c) => (
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
        </div>
      </div>

      {/* Win overlay */}
      {win && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-6 animate-fade-in"
          onClick={() => setWin(null)}
        >
          <div className="card w-full max-w-xs animate-win-burst border border-mega-gold/30 p-6 text-center">
            <TrophyIcon className="mx-auto h-12 w-12 text-game-gold" />
            <div className="mt-2 text-lg font-black text-game-gold">You won!</div>
            <div className="mt-1 text-sm text-slate-300">
              Result was <span className="font-bold text-white">{win.digit}</span>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-3xl font-black text-game-green">
              + <CoinIcon className="text-game-gold" /> {win.amount}
            </div>
            <button onClick={() => setWin(null)} className="btn-blue mt-5 w-full">
              Collect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── helpers & sub-components ───────────────────────── */

function modeLabel(mode: string) {
  return (
    MODES.find((m) => m.key === mode)?.label ?? mode.charAt(0) + mode.slice(1).toLowerCase()
  );
}
function labelFor(sel: string) {
  if (sel === "RED" || sel === "GREEN" || sel === "VIOLET")
    return sel.charAt(0) + sel.slice(1).toLowerCase();
  return `Number ${sel}`;
}
/** Potential win for a pending bet, computed on the post-fee effective stake. */
function potentialWin(b: MyBet): string {
  const mult =
    b.selection === "VIOLET"
      ? 4.5
      : b.selection === "RED" || b.selection === "GREEN"
      ? 2
      : 9;
  return (Math.floor(b.effectiveBet * mult) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function dotColor(c: string) {
  return c === "RED" ? "#fb5b6b" : c === "GREEN" ? "#1bc47d" : "#9b6bff";
}
function numberBg(d: number) {
  if (d === 0) return "linear-gradient(135deg, #fb5b6b 0 50%, #9b6bff 50% 100%)";
  if (d === 5) return "linear-gradient(135deg, #1bc47d 0 50%, #9b6bff 50% 100%)";
  return d % 2 === 0
    ? "linear-gradient(160deg, #fb5b6b, #e23b4e)"
    : "linear-gradient(160deg, #1bc47d, #0e9c63)";
}

function ColorButton({
  label,
  pay,
  active,
  onClick,
  cls,
}: {
  label: string;
  pay: string;
  active: boolean;
  onClick: () => void;
  cls: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center rounded-2xl bg-gradient-to-br py-3 text-white transition active:scale-95 ${cls} ${
        active ? "ring-2 ring-white ring-offset-2 ring-offset-ink-800" : "opacity-95"
      }`}
    >
      <span className="text-base font-black">{label}</span>
      <span className="text-[11px] opacity-90">{pay}</span>
    </button>
  );
}

function DigitBall({
  digit,
  size = "md",
}: {
  digit: number | null;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-base";
  return (
    <span
      className={`grid ${dim} place-items-center rounded-full font-black text-white shadow`}
      style={{ background: digit === null ? "#1e2e54" : numberBg(digit) }}
    >
      {digit ?? "?"}
    </span>
  );
}

function SelectionBadge({ selection }: { selection: string }) {
  if (selection === "RED" || selection === "GREEN" || selection === "VIOLET") {
    return (
      <span
        className="grid h-9 w-9 place-items-center rounded-xl text-[10px] font-bold text-white"
        style={{ background: dotColor(selection) }}
      >
        {selection[0]}
      </span>
    );
  }
  return <DigitBall digit={Number(selection)} />;
}

