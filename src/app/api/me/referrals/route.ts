import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/http";

export const dynamic = "force-dynamic";

// The current user's referral stats: who they referred (count + recent list).
export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  const [count, recent] = await Promise.all([
    prisma.user.count({ where: { referredBy: user.id } }),
    prisma.user.findMany({
      where: { referredBy: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { username: true, createdAt: true },
    }),
  ]);

  return ok({
    code: user.id, // referral code = this user's id
    count,
    recent: recent.map((r) => ({
      username: r.username,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
