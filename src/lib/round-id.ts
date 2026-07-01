// ────────────────────────────────────────────────────────────────────────────
// Human-facing round IDs — UNIQUE PER GAME, derived from the CANONICAL period.
//
// Every game stores its own independent round stream in `GameRound`, keyed by
// the composite-unique (game, period). `period` is the single source of truth:
//   • prediction modes: period = floor(roundStartMs / roundMs) — strictly
//     increasing, one value per round.
//   • crash: period = a small monotonic counter (1, 2, 3 …).
//
// The visible ID is built DIRECTLY from `period` plus a distinct per-game
// numeric prefix. This is the important part:
//
//   ⚠️  We must NOT recompute the ID from `startAt ÷ roundMs`. Doing so makes the
//   ID depend on the *current* round-length setting, so when an operator changes
//   a game's round length, historical rounds created under the old cadence get
//   re-bucketed and several distinct rounds (each with its own result) collapse
//   onto the SAME displayed Period — the "duplicate period, different number"
//   bug. Deriving from `period` is immune to any cadence change.
//
// Because `period` is unique and monotonic per game, and the prefix differs per
// game, two rows can never share an ID within any realistically co-visible
// window (history = 10 rows, admin page = 20). A 6-digit suffix only recycles
// after 1,000,000 rounds (~3.4 years at 180s), which are never shown together.
//
// Display-only: never touches engine timing, settlement, or the DB.
// ────────────────────────────────────────────────────────────────────────────

export const GAME_PREFIX: Record<string, string> = {
  COLOR: "99001",
  PARITY: "31045",
  SAPRE: "52078",
  BCONE: "74099",
  EMERD: "88012",
  CRASH: "15000",
  NUMBER: "60023",
};

const SUFFIX_MOD = 1_000_000; // 6-digit suffix

function toNum(period: bigint | number | string): number {
  return typeof period === "bigint" ? Number(period) : Number(period);
}

/**
 * Public round ID for a game: `<prefix><period mod 1e6, 6-digit>`.
 * Pure function of (game, period) — stable for a given round forever.
 */
export function formatRoundId(game: string, period: bigint | number | string): string {
  const prefix = GAME_PREFIX[game] ?? "10000";
  const seq = ((toNum(period) % SUFFIX_MOD) + SUFFIX_MOD) % SUFFIX_MOD;
  return `${prefix}${String(seq).padStart(6, "0")}`;
}
