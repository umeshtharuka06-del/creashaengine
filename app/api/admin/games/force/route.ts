import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { forceResultSchema, firstError } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { formatRoundId } from "@/lib/round-id";

export const dynamic = "force-dynamic";

/** List the not-yet-settled COLOR/NUMBER rounds an admin can force. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const rounds = await prisma.gameRound.findMany({
    where: {
      game: { in: ["PARITY", "SAPRE", "BCONE", "EMERD", "COLOR", "NUMBER"] },
      state: { not: "SETTLED" },
    },
    orderBy: [{ game: "asc" }, { period: "desc" }],
    take: 20,
    include: { _count: { select: { bets: true } } },
  });

  return ok(
    rounds.map((r) => ({
      id: r.id,
      roundId: formatRoundId(r.game, r.period),
      game: r.game,
      state: r.state,
      bets: r._count.bets,
      forcedResult: r.forcedResult ? JSON.parse(r.forcedResult) : null,
      startAt: r.startAt.toISOString(),
      lockAt: r.lockAt.toISOString(),
      settleAt: r.settleAt.toISOString(),
    }))
  );
}

/**
 * Force the outcome of a not-yet-settled round.
 * Body: { roundId, game: "COLOR"|"NUMBER", color?, digit? }
 * The prediction engine reads this at settlement and uses it verbatim.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = forceResultSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { roundId, game, color, digit } = parsed.data;

  if (game === "NUMBER" && digit == null)
    return fail("Number rounds require a digit (0-9).");
  if (color == null && digit == null)
    return fail("Provide a color or a digit (0-9) to force.");

  const round = await prisma.gameRound.findUnique({ where: { id: roundId } });
  if (!round) return fail("Round not found.", 404);
  if (round.game !== game) return fail("Round/game mismatch.", 400);
  if (round.state === "SETTLED")
    return fail("That round is already settled.", 409);

  // PredictionForced / ColorForced / NumberForced all accept {color} or {digit}.
  const forced =
    game === "NUMBER"
      ? { digit }
      : digit != null
      ? { digit }
      : { color };

  await prisma.gameRound.update({
    where: { id: roundId },
    data: { forcedResult: JSON.stringify(forced) },
  });
  await audit("admin.game.force", {
    userId: admin.id,
    detail: { roundId, game, forced },
  });

  return ok({ roundId, forced });
}

/** Clear a previously-set forced result, returning the round to the engine. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const roundId = req.nextUrl.searchParams.get("roundId");
  if (!roundId) return fail("roundId required.");

  await prisma.gameRound.update({
    where: { id: roundId },
    data: { forcedResult: null },
  });
  await audit("admin.game.force.clear", { userId: admin.id, detail: { roundId } });
  return ok({ roundId, cleared: true });
}
