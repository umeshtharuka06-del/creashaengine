import { NextRequest } from "next/server";
import { runDepositPoll } from "@/lib/crypto/poller";
import { requireAdmin } from "@/lib/auth";
import { ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

// Runs ONE deposit-poll cycle. In production the deposit-scanner worker calls
// `runDepositPoll()` directly on a loop (see src/workers/deposit-scanner.ts), so
// this HTTP route is retained only as a manual trigger from the admin panel /
// an external scheduler:
//
//   curl -H "x-cron-secret: $CRON_SECRET" https://<site>/api/crypto/cron/poll
//
// Authorised by the CRON_SECRET env var, OR an authenticated admin (so it can be
// triggered manually from the panel). The poll itself is fully idempotent.
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header =
      req.headers.get("x-cron-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "";
    if (header && header === secret) return true;
  }
  return !!(await requireAdmin());
}

async function handle(req: NextRequest) {
  if (!(await authorized(req))) return fail("Forbidden.", 403);
  try {
    const result = await runDepositPoll();
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Poll failed.", 502);
  }
}

export const GET = handle;
export const POST = handle;
