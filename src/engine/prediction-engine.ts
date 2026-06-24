/**
 * ───────────────────────────────────────────────────────────────────────────
 *  PREDICTION ENGINE  (Color + Number)
 * ───────────────────────────────────────────────────────────────────────────
 *  Pure, side-effect-free result logic. It does NOT touch the database — the
 *  website (src/lib/*-game.ts) feeds it the round's bets and the engine returns
 *  the outcome. This keeps the "house logic" in one auditable place, separate
 *  from the web app and from the crash engine.
 *
 *  HOUSE RULE
 *  ----------
 *  The option (colour or number) that attracts the HIGHEST total wagered is the
 *  "heavy" side. The heavy side is made to LOSE most of the time; a lighter
 *  (less-bet) side wins. But to stay believable, the heavy side STILL WINS about
 *  4 rounds in every 10 (configurable `heavyWinRate`, default 0.4).
 *
 *  Both the number of bets AND the total amount wagered per option are tallied.
 *  Amount is the primary signal for "heavy"; bet count breaks ties. In the
 *  "heavy loses" branch the winner is drawn from the lighter options with a
 *  weight that is INVERSELY proportional to how much was staked on them — so the
 *  least-backed option is the most likely to win.
 *
 *  An admin "forced result" always overrides the engine (see decide* `forced`).
 * ───────────────────────────────────────────────────────────────────────────
 */

import crypto from "crypto";

export type ColorKey = "RED" | "GREEN" | "VIOLET";
export const COLORS: ColorKey[] = ["RED", "GREEN", "VIOLET"];
export const NUMBERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export const DEFAULT_HEAVY_WIN_RATE = 0.4;
/** Smoothing (coin-cents) so zero-bet options get a large—but finite—weight. */
const WEIGHT_SMOOTH = 100;

export interface EngineBet {
  selection: string; // "RED" | "GREEN" | "VIOLET"  or  "0".."9"
  amount: number; // coin-cents staked
}

export interface OptionStat {
  option: string;
  count: number;
  amount: number;
}

export type DecisionMode = "FORCED" | "NO_BETS" | "HEAVY_WIN" | "HEAVY_LOSE";

/* ─────────────────────────── Seeded RNG ─────────────────────────── */

/**
 * Deterministic RNG seeded from the round's serverSeed, so a given seed always
 * reproduces the same roll (results stay reproducible/auditable even though
 * they are intentionally biased — not provably-fair-random anymore).
 */
export function createSeededRng(seed: string): () => number {
  let counter = 0;
  return () => {
    const h = crypto
      .createHmac("sha256", seed)
      .update(String(counter++))
      .digest();
    // top 6 bytes → [0,1)
    const n = h.readUIntBE(0, 6);
    return n / 0x1000000000000;
  };
}

/* ─────────────────────────── Tally helpers ─────────────────────────── */

export function tally(bets: EngineBet[], options: string[]): OptionStat[] {
  const map = new Map<string, OptionStat>();
  for (const o of options) map.set(o, { option: o, count: 0, amount: 0 });
  for (const b of bets) {
    const s = map.get(b.selection);
    if (!s) continue; // ignore selections outside the option space
    s.count += 1;
    s.amount += b.amount;
  }
  return options.map((o) => map.get(o)!);
}

/** Most-backed option by amount, tie-broken by count, then by seeded rng. */
function pickHeavy(stats: OptionStat[], rng: () => number): OptionStat {
  let best = stats[0];
  for (const s of stats) {
    if (
      s.amount > best.amount ||
      (s.amount === best.amount && s.count > best.count)
    ) {
      best = s;
    }
  }
  // If everything ties at zero, choose at random so it isn't always option 0.
  const allZero = stats.every((s) => s.amount === 0 && s.count === 0);
  if (allZero) return stats[Math.floor(rng() * stats.length)];
  return best;
}

/** Weighted random pick where LOWER staked amount ⇒ HIGHER chance to win. */
function weightedInversePick(
  candidates: OptionStat[],
  rng: () => number
): OptionStat {
  const weights = candidates.map((c) => 1 / (c.amount + WEIGHT_SMOOTH));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Core "who wins" decision shared by colour and number games. */
function decideWinner(
  stats: OptionStat[],
  heavyWinRate: number,
  rng: () => number
): { winner: string; heavy: string; mode: DecisionMode } {
  const anyBets = stats.some((s) => s.amount > 0 || s.count > 0);
  const heavy = pickHeavy(stats, rng);

  if (!anyBets) {
    // No exposure — pick uniformly so empty rounds look natural.
    const w = stats[Math.floor(rng() * stats.length)];
    return { winner: w.option, heavy: heavy.option, mode: "NO_BETS" };
  }

  const heavyWins = rng() < heavyWinRate;
  if (heavyWins) {
    return { winner: heavy.option, heavy: heavy.option, mode: "HEAVY_WIN" };
  }

  const lighter = stats.filter((s) => s.option !== heavy.option);
  const winner = weightedInversePick(lighter, rng);
  return { winner: winner.option, heavy: heavy.option, mode: "HEAVY_LOSE" };
}

/* ─────────────────────────── Colour mapping ─────────────────────────── */

export function colorsOfDigit(d: number): ColorKey[] {
  const out: ColorKey[] = [d % 2 === 0 ? "RED" : "GREEN"];
  if (d === 0 || d === 5) out.push("VIOLET");
  return out;
}

const ALL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Choose a digit so that `winner` wins. `exclude` colours must NOT win on that
 * digit (used to guarantee the heavy colour actually loses). Pure single-colour
 * digits are preferred to avoid handing out an unintended VIOLET win.
 */
function pickDigitForColor(
  winner: ColorKey,
  exclude: ColorKey[],
  stats: OptionStat[],
  rng: () => number
): number {
  const amt = (c: ColorKey) => stats.find((s) => s.option === c)?.amount ?? 0;

  let candidates = ALL_DIGITS.filter((d) => {
    const cs = colorsOfDigit(d);
    return cs.includes(winner) && !exclude.some((e) => cs.includes(e));
  });

  if (candidates.length === 0) {
    // Fallback: any digit where the winner wins.
    candidates = ALL_DIGITS.filter((d) => colorsOfDigit(d).includes(winner));
  }

  if (winner === "VIOLET") {
    // 0 (red+violet) or 5 (green+violet): keep the one whose companion colour
    // has the lower stake, to minimise payout.
    const viable = candidates.filter((d) => d === 0 || d === 5);
    if (viable.length) {
      viable.sort((a, b) => {
        const ca: ColorKey = a === 0 ? "RED" : "GREEN";
        const cb: ColorKey = b === 0 ? "RED" : "GREEN";
        return amt(ca) - amt(cb);
      });
      return viable[0];
    }
  } else {
    // Prefer pure (single-colour) digits so no extra colour wins for free.
    const pure = candidates.filter((d) => colorsOfDigit(d).length === 1);
    if (pure.length) return pure[Math.floor(rng() * pure.length)];
  }

  return candidates[Math.floor(rng() * candidates.length)];
}

/* ─────────────────────────── Public API ─────────────────────────── */

export interface ColorDecision {
  digit: number;
  colors: ColorKey[];
  winningColor: ColorKey;
  heavyColor: ColorKey;
  mode: DecisionMode;
  stats: OptionStat[];
}

export interface ColorForced {
  /** Force a specific winning colour … */
  color?: ColorKey;
  /** … or force an exact digit (wins for whatever colours that digit covers). */
  digit?: number;
}

export function decideColorResult(opts: {
  bets: EngineBet[];
  serverSeed: string;
  period: bigint | number;
  heavyWinRate?: number;
  forced?: ColorForced | null;
}): ColorDecision {
  const rng = createSeededRng(`${opts.serverSeed}:color:${opts.period}`);
  const stats = tally(opts.bets, COLORS);
  const heavyWinRate = opts.heavyWinRate ?? DEFAULT_HEAVY_WIN_RATE;

  // Admin override.
  if (opts.forced && (opts.forced.color || opts.forced.digit != null)) {
    let digit: number;
    if (opts.forced.digit != null) digit = ((opts.forced.digit % 10) + 10) % 10;
    else digit = pickDigitForColor(opts.forced.color!, [], stats, rng);
    const colors = colorsOfDigit(digit);
    return {
      digit,
      colors,
      winningColor: opts.forced.color ?? colors[0],
      heavyColor: pickHeavy(stats, rng).option as ColorKey,
      mode: "FORCED",
      stats,
    };
  }

  const { winner, heavy, mode } = decideWinner(stats, heavyWinRate, rng);
  const exclude = mode === "HEAVY_LOSE" ? [heavy as ColorKey] : [];
  const digit = pickDigitForColor(winner as ColorKey, exclude, stats, rng);

  return {
    digit,
    colors: colorsOfDigit(digit),
    winningColor: winner as ColorKey,
    heavyColor: heavy as ColorKey,
    mode,
    stats,
  };
}

export interface NumberDecision {
  digit: number;
  winningNumber: number;
  heavyNumber: number;
  mode: DecisionMode;
  stats: OptionStat[];
}

export interface NumberForced {
  digit: number;
}

export function decideNumberResult(opts: {
  bets: EngineBet[];
  serverSeed: string;
  period: bigint | number;
  heavyWinRate?: number;
  forced?: NumberForced | null;
}): NumberDecision {
  const rng = createSeededRng(`${opts.serverSeed}:number:${opts.period}`);
  const stats = tally(opts.bets, NUMBERS);
  const heavyWinRate = opts.heavyWinRate ?? DEFAULT_HEAVY_WIN_RATE;

  if (opts.forced && opts.forced.digit != null) {
    const digit = ((opts.forced.digit % 10) + 10) % 10;
    return {
      digit,
      winningNumber: digit,
      heavyNumber: Number(pickHeavy(stats, rng).option),
      mode: "FORCED",
      stats,
    };
  }

  const { winner, heavy, mode } = decideWinner(stats, heavyWinRate, rng);
  return {
    digit: Number(winner),
    winningNumber: Number(winner),
    heavyNumber: Number(heavy),
    mode,
    stats,
  };
}
