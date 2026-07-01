import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Minimal structured logger. Writes timestamped JSON-ish lines to logs/ and
 * echoes to stdout/stderr (so `pm2 logs` shows them too).
 *
 *   logs/engine.log      — lifecycle: startup, ticks, round creation
 *   logs/settlement.log  — every settled round (game, period, result summary)
 *   logs/error.log       — anything that threw
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "..", "logs");

fs.mkdirSync(LOG_DIR, { recursive: true });

type Channel = "engine" | "settlement" | "error" | "lifecycle";

function write(channel: Channel, level: string, msg: string, data?: unknown) {
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...(data !== undefined ? { data } : {}),
    }) + "\n";
  try {
    fs.appendFileSync(path.join(LOG_DIR, `${channel}.log`), line);
  } catch {
    // Never let logging crash the worker.
  }
  const out = level === "error" ? process.stderr : process.stdout;
  out.write(line);
}

/** Append to a channel's log file only (no stdout/stderr echo). */
function writeFileOnly(channel: Channel, level: string, msg: string, data?: unknown) {
  const line =
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(data !== undefined ? { data } : {}) }) + "\n";
  try {
    fs.appendFileSync(path.join(LOG_DIR, `${channel}.log`), line);
  } catch {
    // Never let logging crash the worker.
  }
}

export const log = {
  engine: (msg: string, data?: unknown) => write("engine", "info", msg, data),
  settlement: (msg: string, data?: unknown) =>
    write("settlement", "info", msg, data),
  error: (msg: string, data?: unknown) => {
    write("error", "error", msg, data);
    // Errors are also useful in the main engine log for context.
    write("engine", "error", msg, data);
  },
  // Per-round lifecycle events (BETTING → RESULT_GENERATED → SETTLED → PAYOUT).
  // One line to stdout + logs/lifecycle.log (no duplicate echo).
  lifecycle: (msg: string, data?: unknown) => write("lifecycle", "info", msg, data),
  // Full diagnostic dump when a round stalls or the worker throws. One line to
  // stderr + logs/error.log; also mirrored into logs/lifecycle.log WITHOUT a
  // second console echo so it sits next to the round's lifecycle events.
  dump: (msg: string, data?: unknown) => {
    write("error", "error", msg, data);
    writeFileOnly("lifecycle", "error", msg, data);
  },
};

export const LOG_DIR_PATH = LOG_DIR;
