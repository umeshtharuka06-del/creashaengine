import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { applyBalance, fmtCoins } from "@/lib/wallet";
import { adminWithdrawActionSchema, firstError } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { notifyWithdrawResolved } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// List withdrawal requests (optionally filtered by status) for the admin queue.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const status = req.nextUrl.searchParams.get("status")?.toUpperCase();
  const where =
    status && ["PENDING", "APPROVED", "COMPLETED", "REJECTED"].includes(status)
      ? { status }
      : {};

  const rows = await prisma.withdrawal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Attach usernames without a relation join.
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, username: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.username]));

  return ok(
    rows.map((w) => ({
      id: w.id,
      user: nameOf.get(w.userId) ?? "—",
      coinsFmt: fmtCoins(w.coins),
      usdt: w.usdt,
      feeUsdt: w.feeUsdt,
      receiveUsdt: w.receiveUsdt,
      address: w.address,
      status: w.status,
      txid: w.txid,
      createdAt: w.createdAt.toISOString(),
    }))
  );
}

// Approve / reject / complete a withdrawal.
//   approve  : PENDING            → APPROVED
//   reject   : PENDING|APPROVED   → REJECTED  (+ refund the held coins)
//   complete : APPROVED|PENDING   → COMPLETED (requires the on-chain TXID)
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = adminWithdrawActionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { id, action, txid, note } = parsed.data;

  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) return fail("Withdrawal not found.", 404);
  if (w.status === "COMPLETED" || w.status === "REJECTED")
    return fail("This request is already finalised.", 409);

  try {
    if (action === "approve") {
      if (w.status !== "PENDING") return fail("Only pending requests can be approved.", 409);
      await prisma.withdrawal.update({ where: { id }, data: { status: "APPROVED", adminId: admin.id } });
    } else if (action === "reject") {
      // Refund the held coins atomically and mark rejected.
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.withdrawal.findUnique({ where: { id } });
        if (!fresh || fresh.status === "REJECTED" || fresh.status === "COMPLETED") return;
        await applyBalance(tx, fresh.userId, fresh.coins, "WITHDRAWAL_REFUND", fresh.id, {
          reason: "withdrawal rejected",
        });
        await tx.withdrawal.update({
          where: { id },
          data: { status: "REJECTED", adminId: admin.id, note: note ?? null, processedAt: new Date() },
        });
      });
    } else {
      // complete — admin has sent USDT from Trust Wallet and pasted the TXID.
      await prisma.withdrawal.update({
        where: { id },
        data: { status: "COMPLETED", adminId: admin.id, txid: txid!, processedAt: new Date() },
      });
    }

    await audit(`crypto.withdraw.${action}`, { userId: admin.id, detail: { id, txid } });

    const wUser = await prisma.user.findUnique({ where: { id: w.userId }, select: { username: true } });
    const status = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Completed";
    await notifyWithdrawResolved({
      username: wUser?.username ?? "—",
      uid: w.userId,
      coins: fmtCoins(w.coins),
      address: w.address,
      status,
    });

    return ok({ id, action });
  } catch (e) {
    return handleError(e);
  }
}
