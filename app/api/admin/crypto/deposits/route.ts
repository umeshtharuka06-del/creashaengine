import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtCoins } from "@/lib/wallet";
import { releaseWallet } from "@/lib/crypto/wallet-assign";
import { approveDeposit } from "@/lib/crypto/deposit-service";
import { adminDepositActionSchema, firstError } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/http";
import { audit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"];

// List deposit requests for the admin queue (status filter + light search).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.toUpperCase();
  const q = sp.get("q")?.trim();

  const where: Prisma.DepositWhereInput = {};
  if (status && STATUSES.includes(status)) where.status = status;

  if (q) {
    // Search by username, user id (UID), or txid.
    const users = await prisma.user.findMany({
      where: { OR: [{ username: { contains: q, mode: "insensitive" } }, { id: q }] },
      select: { id: true },
    });
    where.OR = [
      { userId: { in: users.map((u) => u.id) } },
      { txid: { contains: q } },
      { toAddress: { contains: q } },
    ];
  }

  const rows = await prisma.deposit.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const wallets = await prisma.depositWallet.findMany({ select: { id: true, name: true } });
  const walletName = new Map(wallets.map((w) => [w.id, w.name]));
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, username: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.username]));

  return ok(
    rows.map((d) => ({
      id: d.id,
      user: nameOf.get(d.userId) ?? "—",
      uid: d.userId,
      amountUsdt: d.amountUsdt,
      coinsFmt: fmtCoins(d.coins),
      wallet: (d.walletId && walletName.get(d.walletId)) || "—",
      walletAddress: d.toAddress ?? "",
      network: d.network,
      txid: d.txid,
      confirmations: d.confirmations,
      status: d.status, // PENDING | APPROVED | REJECTED
      createdAt: d.createdAt.toISOString(),
    }))
  );
}

// Approve (credit) or reject a deposit request.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = adminDepositActionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { id, action, txid, note } = parsed.data;

  const dep = await prisma.deposit.findUnique({ where: { id } });
  if (!dep) return fail("Deposit request not found.", 404);
  if (dep.status !== "PENDING") return fail("This request is already finalised.", 409);

  try {
    if (action === "approve") {
      // Attach the admin-supplied txid if the poller hasn't already found one.
      if (txid && !dep.txid) {
        const used = await prisma.deposit.findFirst({ where: { txid, id: { not: id } } });
        if (used) return fail("That transaction id is already used.", 409);
        await prisma.deposit.update({ where: { id }, data: { txid } });
      }
      const credited = await approveDeposit(id, { adminId: admin.id, via: "admin" });
      if (!credited) return fail("This request is already finalised.", 409);
    } else {
      // reject — no balance change (deposits are never debited). Release the
      // wallet lock so the user can submit a fresh request.
      await prisma.deposit.update({
        where: { id },
        data: { status: "REJECTED", adminId: admin.id, note: note ?? null, processedAt: new Date() },
      });
      await releaseWallet(dep.userId);
    }

    await audit(`crypto.deposit.${action}`, { userId: admin.id, detail: { id, txid } });
    return ok({ id, action });
  } catch (e) {
    return handleError(e);
  }
}
