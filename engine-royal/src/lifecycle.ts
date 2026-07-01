import { log } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Per-round lifecycle instrumentation.
//
// Tracks every round currently being settled (which stage it is in, when it
// started, and the JS stack at entry) so that if a round STOPS mid-flight we can
// dump exactly where it is stuck — the closest thing Node gives us to "pending
// promise / transaction state" without full async-hooks overhead.
//
// Verbose per-round tracing is gated behind ENGINE_TRACE=1 so it can be turned on
// in production during an investigation and off afterwards. Stall dumps and error
// dumps ALWAYS fire regardless of the flag.
// ─────────────────────────────────────────────────────────────────────────────

export const TRACE_ON =
  process.env.ENGINE_TRACE === "1" || process.env.ENGINE_TRACE === "true";

export type Stage =
  | "BETTING"
  | "RESULT_GENERATED"
  | "SETTLED"
  | "PAYOUT_COMPLETED"
  | "FAILED";

interface Inflight {
  roundId: string;
  game: string;
  period: string;
  stage: Stage;
  startedAt: number;
  stack: string;
}

const inflight = new Map<string, Inflight>();

/** Emit a lifecycle stage line (only when ENGINE_TRACE is enabled). */
export function trace(stage: Stage, data: Record<string, unknown>) {
  if (TRACE_ON) log.lifecycle(`LIFECYCLE ${stage}`, data);
}

/** Mark a round as entering settlement (stage BETTING → …). */
export function begin(roundId: string, game: string, period: string) {
  inflight.set(roundId, {
    roundId,
    game,
    period,
    stage: "BETTING",
    startedAt: Date.now(),
    stack: new Error("inflight-entry").stack ?? "",
  });
}

/** Advance the recorded stage for a round currently in flight. */
export function stage(roundId: string, s: Stage) {
  const o = inflight.get(roundId);
  if (o) o.stage = s;
}

/** Round finished (settled + paid, or terminally failed) — stop tracking it. */
export function end(roundId: string) {
  inflight.delete(roundId);
}

/** Snapshot of every round still in flight and how long it has been stuck. */
export function inflightSnapshot() {
  const now = Date.now();
  return [...inflight.values()].map((o) => ({
    roundId: o.roundId,
    game: o.game,
    period: o.period,
    stage: o.stage,
    ageMs: now - o.startedAt,
    stack: o.stack,
  }));
}
