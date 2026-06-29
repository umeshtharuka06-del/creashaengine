import {
  getCurrentPredictionRound,
  recentPredictionRounds,
  sanitizeRound,
  modeRoundMs,
  isPredictionMode,
} from "@/lib/prediction-game";
import { ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

// READ-ONLY. The engine service (engine-royal/) creates and settles rounds; the
// website only reads them here.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mode: string }> }
) {
  const { mode } = await params;
  const m = mode.toUpperCase();
  if (!isPredictionMode(m)) return fail("Unknown game mode.", 404);

  try {
    const roundMs = await modeRoundMs(m);
    const [round, history] = await Promise.all([
      getCurrentPredictionRound(m),
      recentPredictionRounds(m, 10),
    ]);
    return ok({
      mode: m,
      roundMs,
      round: round ? sanitizeRound(round, roundMs) : null,
      history,
      serverNow: new Date().toISOString(),
    });
  } catch {
    return fail("Service temporarily unavailable.", 503);
  }
}
