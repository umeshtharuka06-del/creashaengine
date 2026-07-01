import { NextResponse } from "next/server";

// Every API response in this app is dynamic, per-request JSON (live rounds,
// history, balances). None of it may be cached by the browser, bfcache, or the
// Cloudflare edge that fronts the origin — a cached `…/current` response is what
// made History/Last-10 "stick on an old period until a refresh". `no-store`
// forbids storing the response at every layer, so polling always sees fresh data.
const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function withNoStore(init?: ResponseInit): ResponseInit {
  return { ...init, headers: { ...NO_STORE, ...(init?.headers || {}) } };
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, withNoStore(init));
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, withNoStore({ status }));
}

/** Map known thrown error codes to friendly HTTP responses. */
export function handleError(e: unknown) {
  const msg = e instanceof Error ? e.message : "Unknown error";
  switch (msg) {
    case "INSUFFICIENT_FUNDS":
      return fail("Not enough coins.", 400, msg);
    case "BETTING_CLOSED":
      return fail("Betting is closed for this round.", 409, msg);
    case "ROUND_NOT_READY":
      return fail("The next round is being prepared — try again in a moment.", 409, msg);
    case "ALREADY_BET":
      return fail("You already have a bet this round.", 409, msg);
    case "ALREADY_CRASHED":
    case "NO_RUNNING_ROUND":
    case "NO_ACTIVE_BET":
      return fail("Too late to cash out.", 409, msg);
    case "WALLET_NOT_FOUND":
      return fail("Wallet not found.", 404, msg);
    default:
      return fail("Something went wrong.", 500, "INTERNAL");
  }
}
