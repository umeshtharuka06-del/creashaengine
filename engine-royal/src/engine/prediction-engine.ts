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

/* ═══════════════════════════════════════════════════════════════════════════
 *  UNIFIED PREDICTION DECIDER  (Color + Number in ONE round)
 * ═══════════════════════════════════════════════════════════════════════════
 *  The 2026 redesign merges Color and Number into a single round per game mode
 *  (PARITY / SAPRE / BCONE / EMERD). One digit 0–9 is drawn; colour bets settle
 *  by the digit's colour(s) and number bets settle by exact-digit match.
 *
 *  Because both bet kinds resolve from the SAME digit, the house rule is applied
 *  at the DIGIT level: for each candidate digit we compute the total payout the
 *  house would owe if it won (colour payouts + number payouts). The "heavy"
 *  digit is the most expensive one; it is made to LOSE most of the time. To stay
 *  believable the heavy digit still wins ~`heavyWinRate` of rounds; otherwise a
 *  cheaper digit wins, weighted INVERSELY to its payout (cheapest = likeliest).
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Per-colour payout multiplier for a given winning digit. */
export const COLOR_PAYOUT: Record<ColorKey, (digit: number) => number> = {
  RED: (d) => (d === 0 ? 1.5 : 2),
  GREEN: (d) => (d === 5 ? 1.5 : 2),
  VIOLET: () => 4.5,
};
/** Exact-number payout multiplier. */
export const NUMBER_PAYOUT = 9;

function isColorKey(s: string): s is ColorKey {
  return s === "RED" || s === "GREEN" || s === "VIOLET";
}

/**
 * Coin-cents the house pays a single bet if `digit` is the result (0 if it loses).
 * Shared by the decider (to price digits) and by settlement (to pay winners).
 */
export function payoutForBet(selection: string, amount: number, digit: number): number {
  if (isColorKey(selection)) {
    const cols = colorsOfDigit(digit);
    if (!cols.includes(selection)) return 0;
    return Math.floor(amount * COLOR_PAYOUT[selection](digit));
  }
  const n = Number(selection);
  if (Number.isInteger(n) && n >= 0 && n <= 9 && n === digit) {
    return amount * NUMBER_PAYOUT;
  }
  return 0;
}

/** Total house exposure (coin-cents) across all bets if `digit` wins. */
function housePayoutForDigit(digit: number, bets: EngineBet[]): number {
  let total = 0;
  for (const b of bets) total += payoutForBet(b.selection, b.amount, digit);
  return total;
}

export interface PredictionDecision {
  digit: number;
  colors: ColorKey[];
  winningNumber: number;
  heavyDigit: number;
  mode: DecisionMode;
}

export interface PredictionForced {
  /** Force a winning colour (cheapest matching digit is chosen) … */
  color?: ColorKey;
  /** … or force an exact digit. */
  digit?: number;
}

export function decidePredictionResult(opts: {
  bets: EngineBet[];
  serverSeed: string;
  period: bigint | number;
  heavyWinRate?: number;
  forced?: PredictionForced | null;
}): PredictionDecision {
  const rng = createSeededRng(`${opts.serverSeed}:prediction:${opts.period}`);
  const heavyWinRate = opts.heavyWinRate ?? DEFAULT_HEAVY_WIN_RATE;
  const bets = opts.bets;

  const priced = ALL_DIGITS.map((d) => ({ digit: d, payout: housePayoutForDigit(d, bets) }));
  let heavy = priced[0];
  for (const p of priced) if (p.payout > heavy.payout) heavy = p;

  const done = (digit: number, mode: DecisionMode): PredictionDecision => ({
    digit,
    colors: colorsOfDigit(digit),
    winningNumber: digit,
    heavyDigit: heavy.digit,
    mode,
  });

  // Admin override.
  if (opts.forced && (opts.forced.color || opts.forced.digit != null)) {
    if (opts.forced.digit != null) {
      return done(((opts.forced.digit % 10) + 10) % 10, "FORCED");
    }
    // Force a colour → pick the cheapest digit that colour wins on.
    const cand = ALL_DIGITS.filter((d) => colorsOfDigit(d).includes(opts.forced!.color!));
    cand.sort((a, b) => housePayoutForDigit(a, bets) - housePayoutForDigit(b, bets));
    return done(cand[0], "FORCED");
  }

  const anyBets = bets.some((b) => b.amount > 0);
  if (!anyBets) return done(Math.floor(rng() * 10), "NO_BETS");

  if (rng() < heavyWinRate) return done(heavy.digit, "HEAVY_WIN");

  // Heavy loses: pick a cheaper digit, inversely weighted to its payout.
  const lighter = priced.filter((p) => p.digit !== heavy.digit);
  const weights = lighter.map((p) => 1 / (p.payout + WEIGHT_SMOOTH));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let chosen = lighter[lighter.length - 1];
  for (let i = 0; i < lighter.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      chosen = lighter[i];
      break;
    }
  }
  return done(chosen.digit, "HEAVY_LOSE");
}
