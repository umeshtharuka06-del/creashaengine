import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { parsePage, pageMeta } from "@/lib/pagination";
import { formatRoundId } from "@/lib/round-id";

export const dynamic = "force-dynamic";

/**
 * Admin: paginated view of ALL game rounds (any state, both games).
 *   /api/admin/history?game=COLOR|CRASH&page=1&round=123
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const sp = req.nextUrl.searchParams;
  const p = parsePage(sp);
  const game = sp.get("game")?.toUpperCase();
  const round = sp.get("round")?.trim();

  const ALLOWED = ["COLOR", "CRASH", "NUMBER", "PARITY", "SAPRE", "BCONE", "EMERD"];
  const where: Record<string, unknown> = {};
  if (game && ALLOWED.includes(game)) where.game = game;
  if (round) {
    const asNum = Number(round);
    where.OR = [
      ...(Number.isFinite(asNum) ? [{ period: BigInt(Math.trunc(asNum)) }] : []),
      { id: round },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.gameRound.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: p.skip,
      take: p.pageSize,
      include: { _count: { select: { bets: true } } },
    }),
    prisma.gameRound.count({ where }),
  ]);

  return ok({
    rounds: rows.map((r) => {
      const parsed = r.result ? JSON.parse(r.result) : null;
      return {
        id: r.id,
        roundId: formatRoundId(r.game, r.period),
        game: r.game,
        state: r.state,
        result:
          r.game === "CRASH"
            ? parsed?.crashX
              ? `${(parsed.crashX / 100).toFixed(2)}x`
              : "—"
            : r.game === "NUMBER"
            ? parsed?.digit != null
              ? String(parsed.digit)
              : "—"
            : parsed?.colors?.join(", ") ?? "—",
        bets: r._count.bets,
        settledAt: r.settledAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
    pagination: pageMeta(p, total),
  });
}
