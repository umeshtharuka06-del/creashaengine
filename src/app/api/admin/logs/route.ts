import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { parsePage, pageMeta } from "@/lib/pagination";

export const dynamic = "force-dynamic";

/**
 * Admin: paginated system / audit logs.
 *   /api/admin/logs?page=1&action=user.login
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const sp = req.nextUrl.searchParams;
  const p = parsePage(sp);
  const action = sp.get("action")?.trim();

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: p.skip,
      take: p.pageSize,
      include: { user: { select: { username: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return ok({
    logs: rows.map((l) => ({
      id: l.id,
      action: l.action,
      user: l.user?.username ?? null,
      detail: l.detail,
      ip: l.ip,
      createdAt: l.createdAt.toISOString(),
    })),
    pagination: pageMeta(p, total),
  });
}
