import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applyBalance, COIN, fmtCoins } from "@/lib/wallet";
import { ok, fail, handleError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ email: { contains: q } }, { username: { contains: q } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { wallet: true },
  });

  return ok(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      isAdmin: u.isAdmin,
      isBanned: u.isBanned,
      balance: u.wallet?.balance ?? 0,
      balanceFmt: fmtCoins(u.wallet?.balance ?? 0),
      createdAt: u.createdAt.toISOString(),
    }))
  );
}

const actionSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["ban", "unban", "makeAdmin", "removeAdmin", "credit", "debit"]),
  // coins (whole units) for credit/debit
  amount: z.number().positive().max(1_000_000).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = actionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Invalid request.");
  const { userId, action, amount } = parsed.data;

  if (userId === admin.id && (action === "ban" || action === "removeAdmin"))
    return fail("You cannot demote or ban yourself.", 400);

  try {
    switch (action) {
      case "ban":
        await prisma.user.update({ where: { id: userId }, data: { isBanned: true } });
        break;
      case "unban":
        await prisma.user.update({ where: { id: userId }, data: { isBanned: false } });
        break;
      case "makeAdmin":
        await prisma.user.update({ where: { id: userId }, data: { isAdmin: true } });
        break;
      case "removeAdmin":
        await prisma.user.update({ where: { id: userId }, data: { isAdmin: false } });
        break;
      case "credit":
        if (!amount) return fail("Amount required.");
        await prisma.$transaction((tx) =>
          applyBalance(tx, userId, amount * COIN, "ADMIN_CREDIT", admin.id)
        );
        break;
      case "debit":
        if (!amount) return fail("Amount required.");
        await prisma.$transaction((tx) =>
          applyBalance(tx, userId, -amount * COIN, "ADMIN_DEBIT", admin.id)
        );
        break;
    }
    await audit(`admin.user.${action}`, { userId: admin.id, detail: { target: userId, amount } });
    return ok({ done: true });
  } catch (e) {
    return handleError(e);
  }
}
