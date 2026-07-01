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

/**
 * Run `fn` and swallow+log any throw so one game's failure can never starve the
 * others in the same tick. Each game is independent; a transient DB error on one
 * mode must not stop the remaining modes (or crash) from settling/advancing.
 */
async function isolate(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    log.error(`${label}.failed`, { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Settle every due round across all prediction modes + crash. */
export async function processAllRounds() {
  for (const mode of PREDICTION_MODES) {
    await isolate(`settle.${mode}`, () => settleDuePredictionRounds(mode));
  }
  await isolate("settle.CRASH", () => settleDueCrashRounds());
}

/**
 * Make sure the current/next round exists for every game. (The ensure*
 * functions also settle due rounds first, so calling this alone keeps
 * everything moving.)
 */
export async function createAllRounds() {
  for (const mode of PREDICTION_MODES) {
    await isolate(`ensure.${mode}`, () => ensureCurrentPredictionRound(mode));
  }
  await isolate("ensure.CRASH", () => ensureCurrentCrashRound());
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
