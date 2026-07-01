// ────────────────────────────────────────────────────────────────────────────
// Redis-backed job queue — INFRASTRUCTURE ONLY.
//
// This module exists to move out-of-band side-effects (Telegram notifications,
// withdrawal-request dispatch) OUT of the Next.js request path and into the
// dedicated worker processes (telegram-worker / withdraw-queue). It changes
// WHERE existing work runs, never WHAT it does.
//
// When REDIS_URL is not configured (e.g. local dev), the queue is disabled and
// `enqueue()` returns false so callers fall back to their original inline
// behaviour. Business behaviour is therefore identical with or without Redis.
//
// `ioredis` is imported lazily via a non-literal specifier so the rest of the
// app builds and runs even when Redis is not in use.
// ────────────────────────────────────────────────────────────────────────────

type RedisLike = {
  rpush: (key: string, val: string) => Promise<number>;
  blpop: (key: string, timeout: number) => Promise<[string, string] | null>;
  quit: () => Promise<unknown>;
  on: (ev: string, cb: (...a: unknown[]) => void) => void;
};

async function makeClient(): Promise<RedisLike | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const spec = "ioredis"; // non-literal specifier: keeps this optional at build time
    const mod = (await import(spec)) as unknown as { default?: unknown };
    const Redis = (mod.default ?? mod) as new (url: string, opts?: unknown) => RedisLike;
    const client = new Redis(url, { maxRetriesPerRequest: null });
    client.on("error", (e: unknown) =>
      console.error("[queue] redis error:", e instanceof Error ? e.message : e)
    );
    return client;
  } catch (e) {
    console.error(
      "[queue] ioredis unavailable — queue disabled:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

// Shared connection for the producer side (the web app). The consumer side
// (workers) uses its own dedicated blocking connection via `consume()`.
let sharedPromise: Promise<RedisLike | null> | null = null;
function shared(): Promise<RedisLike | null> {
  if (!sharedPromise) sharedPromise = makeClient();
  return sharedPromise;
}

const keyOf = (name: string) => `queue:${name}`;

/** True when a Redis URL is configured (production). */
export function queueEnabled(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Push a job onto the named queue. Returns false when the queue is disabled or
 * unavailable, so the caller can run the work inline instead (graceful
 * fallback — identical behaviour to the pre-migration code path).
 */
export async function enqueue(name: string, payload: unknown): Promise<boolean> {
  const client = await shared();
  if (!client) return false;
  try {
    await client.rpush(keyOf(name), JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error(`[queue] enqueue ${name} failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Block-and-consume jobs from the named queue until `signal` aborts. Used by the
 * dedicated worker processes. Each job is JSON-decoded and passed to `handler`;
 * handler errors are logged and the loop continues (at-most-once delivery, which
 * matches the fire-and-forget nature of the existing notifications).
 */
export async function consume(
  name: string,
  handler: (payload: unknown) => Promise<void>,
  opts: { signal?: AbortSignal; onError?: (e: unknown) => void } = {}
): Promise<void> {
  const client = await makeClient();
  if (!client) throw new Error("REDIS_URL is required to run a queue worker.");
  const key = keyOf(name);
  try {
    while (!opts.signal?.aborted) {
      let res: [string, string] | null = null;
      try {
        res = await client.blpop(key, 2); // block up to 2s, then re-check abort
      } catch (e) {
        console.error(`[queue] blpop ${name} error:`, e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!res) continue; // timeout
      try {
        await handler(JSON.parse(res[1]));
      } catch (e) {
        opts.onError?.(e);
        console.error(`[queue] handler ${name} failed:`, e instanceof Error ? e.message : e);
      }
    }
  } finally {
    await client.quit().catch(() => {});
  }
}
