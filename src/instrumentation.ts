// Next.js instrumentation hook — runs once when the server process boots.
// Used here to validate the environment fail-fast: in production a missing or
// insecure secret aborts startup rather than serving with a broken/insecure
// config. In development it only warns so local work is never blocked.
export async function register() {
  // Node.js server runtime only (skip the edge runtime for middleware).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("./lib/env");
  const result = validateEnv();
  if (result.ok) return;

  const message =
    "[env] Environment validation failed:\n  - " + result.errors.join("\n  - ");

  if (process.env.NODE_ENV === "production") {
    // Fail fast — do not start the server with an invalid/insecure config.
    throw new Error(message);
  }
  console.warn(message);
}
