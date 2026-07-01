/**
 * ───────────────────────────────────────────────────────────────────────────
 *  CRASH ENGINE
 * ───────────────────────────────────────────────────────────────────────────
 *  Pure, side-effect-free crash math, kept separate from the web app exactly
 *  like the prediction engine. The website (src/lib/crash-game.ts) handles the
 *  database/round orchestration and calls into here for every number.
 *
 *  Behaviour is identical to the original implementation:
 *    multiplier(t) = exp(GROWTH_PER_MS * elapsedMs)   (2x ≈ 4.6s, 10x ≈ 15s)
 *  and a bustabit-style provably-fair crash point with a configurable house
 *  edge (an "instant bust" slice at 1.00x).
 * ───────────────────────────────────────────────────────────────────────────
 */

import crypto from "crypto";

// Growth rate of the live multiplier. Exposed for callers that animate it.
export const GROWTH_PER_MS = 0.00015;

function hmac(serverSeed: string, message: string): string {
  return crypto.createHmac("sha256", serverSeed).update(message).digest("hex");
}

/** Live multiplier (×100) at `elapsedMs` since the round started running. */
export function multiplierAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return 100;
  const m = Math.exp(GROWTH_PER_MS * elapsedMs) * 100;
  return Math.max(100, Math.floor(m));
}

/** How long (ms) the round runs before it busts at `crashX` (×100). */
export function durationMsForCrash(crashX: number): number {
  if (crashX <= 100) return 0;
  return Math.round(Math.log(crashX / 100) / GROWTH_PER_MS);
}

/**
 * Crash point (×100, e.g. 247 = 2.47x) for a round.
 * `houseEdgePct` controls the instant-bust slice (1% ⇒ 1 in 100 busts at 1.00x).
 */
export function crashPoint(
  serverSeed: string,
  clientSeed: string,
  period: bigint | number,
  houseEdgePct = 1
): number {
  const h = hmac(serverSeed, `${clientSeed}:${period.toString()}`);
  const edgeDivisor = Math.round(100 / houseEdgePct);
  const e = parseInt(h.slice(0, 8), 16);
  if (e % edgeDivisor === 0) return 100; // 1.00x instant bust

  const num = parseInt(h.slice(0, 13), 16);
  const max = Math.pow(2, 52);
  const result = Math.floor((100 * max - num) / (max - num));
  return Math.max(100, result);
}
