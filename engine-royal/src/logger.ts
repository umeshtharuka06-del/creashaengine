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

type Channel = "engine" | "settlement" | "error";

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

export const log = {
  engine: (msg: string, data?: unknown) => write("engine", "info", msg, data),
  settlement: (msg: string, data?: unknown) =>
    write("settlement", "info", msg, data),
  error: (msg: string, data?: unknown) => {
    write("error", "error", msg, data);
    // Errors are also useful in the main engine log for context.
    write("engine", "error", msg, data);
  },
};

export const LOG_DIR_PATH = LOG_DIR;
