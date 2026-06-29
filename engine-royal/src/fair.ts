import crypto from "crypto";

/**
 * Provably-fair primitives (EXACT copy of the website's src/lib/fair.ts).
 * Used here only for round creation (seed + hash). Result generation itself
 * lives in the prediction/crash engines.
 */

export function randomServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSeed(serverSeed: string): string {
  return crypto.createHash("sha256").update(serverSeed).digest("hex");
}

export function verifyReveal(serverSeed: string, publishedHash: string): boolean {
  return hashSeed(serverSeed) === publishedHash;
}
