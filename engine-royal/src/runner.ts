import {
  PREDICTION_MODES,
  ensureCurrentPredictionRound,
  settleDuePredictionRounds,
} from "./games/prediction-game";
import {
  ensureCurrentCrashRound,
  settleDueCrashRounds,
} from "./games/crash-game";
import { log } from "./logger";

// The 2026 redesign replaced the separate COLOR/NUMBER games with four unified
// prediction modes (PARITY/SAPRE/BCONE/EMERD) — each a single round stream that
// carries BOTH colour and number bets. Crash is unchanged. The scheduler /
// settlement-worker architecture below is exactly as before; only the set of
// games it iterates over was extended.

/** Settle every due round across all prediction modes + crash. */
export async function processAllRounds() {
  for (const mode of PREDICTION_MODES) {
    await settleDuePredictionRounds(mode);
  }
  await settleDueCrashRounds();
}

/**
 * Make sure the current/next round exists for every game. (The ensure*
 * functions also settle due rounds first, so calling this alone keeps
 * everything moving.)
 */
export async function createAllRounds() {
  for (const mode of PREDICTION_MODES) {
    await ensureCurrentPredictionRound(mode);
  }
  await ensureCurrentCrashRound();
}

/** One full engine tick: settle what is due, then ensure the next rounds exist. */
export async function tick() {
  try {
    await processAllRounds();
    await createAllRounds();
  } catch (e) {
    log.error("tick.failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
