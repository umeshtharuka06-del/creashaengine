import {
  ensureCurrentColorRound,
  settleDueColorRounds,
} from "./games/color-game";
import {
  ensureCurrentNumberRound,
  settleDueNumberRounds,
} from "./games/number-game";
import {
  ensureCurrentCrashRound,
  settleDueCrashRounds,
} from "./games/crash-game";
import { log } from "./logger";

/** Settle every due round across all three games. */
export async function processAllRounds() {
  await settleDueColorRounds();
  await settleDueNumberRounds();
  await settleDueCrashRounds();
}

/**
 * Make sure the current/next round exists for every game. (The ensure*
 * functions also settle due rounds first — same behaviour as the original
 * website code — so calling this alone keeps everything moving.)
 */
export async function createAllRounds() {
  await ensureCurrentColorRound();
  await ensureCurrentNumberRound();
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
