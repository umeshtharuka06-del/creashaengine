import crypto from "crypto";

/**
 * Provably-fair primitives.
 *
 * For each round we generate a random `serverSeed` and publish its SHA-256
 * hash BEFORE bets are locked. After the round settles we reveal the raw
 * `serverSeed`, so anyone can recompute the outcome and confirm it was not
 * altered. The per-user `clientSeed` and round `period` are mixed in so the
 * operator cannot pick a seed that targets a specific player.
 */

export function randomServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSeed(serverSeed: string): string {
  return crypto.createHash("sha256").update(serverSeed).digest("hex");
}

function hmac(serverSeed: string, message: string): string {
  return crypto.createHmac("sha256", serverSeed).update(message).digest("hex");
}

/**
 * Color Prediction outcome.
 * Returns a digit 0-9 and the winning colors for that digit.
 *  - GREEN digits: 1,3,5,7,9   RED digits: 0,2,4,6,8   VIOLET: 0 and 5
 */
export interface ColorResult {
  digit: number;
  colors: ("RED" | "GREEN" | "VIOLET")[];
  hash: string;
}

export function colorResult(
  serverSeed: string,
  clientSeed: string,
  period: bigint
): ColorResult {
  const h = hmac(serverSeed, `${clientSeed}:${period.toString()}`);
  const digit = parseInt(h.slice(0, 8), 16) % 10;
  const colors: ColorResult["colors"] = [];
  if (digit % 2 === 0) colors.push("RED");
  else colors.push("GREEN");
  if (digit === 0 || digit === 5) colors.push("VIOLET");
  return { digit, colors, hash: h };
}

/**
 * Crash multiplier (bustabit-style), with a configurable house edge.
 * Returns the crash point as an integer ×100 (e.g. 247 = 2.47x).
 */
export function crashPoint(
  serverSeed: string,
  clientSeed: string,
  period: bigint,
  houseEdgePct = 1
): number {
  const h = hmac(serverSeed, `${clientSeed}:${period.toString()}`);
  // instant-bust slice gives the house edge
  const edgeDivisor = Math.round(100 / houseEdgePct); // 1% -> 1 in 100 busts at 1.00x
  const e = parseInt(h.slice(0, 8), 16);
  if (e % edgeDivisor === 0) return 100; // 1.00x

  const num = parseInt(h.slice(0, 13), 16);
  const max = Math.pow(2, 52);
  const result = Math.floor((100 * max - num) / (max - num));
  return Math.max(100, result);
}

/** Verify a revealed serverSeed matches the previously published hash. */
export function verifyReveal(serverSeed: string, publishedHash: string): boolean {
  return hashSeed(serverSeed) === publishedHash;
}
