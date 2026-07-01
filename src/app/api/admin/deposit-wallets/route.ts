import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { depositWalletSchema, depositWalletUpdateSchema, firstError } from "@/lib/validation";
import { ok, fail } from "@/lib/http";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

function serialize(w: {
  id: string;
  name: string;
  address: string;
  network: string;
  active: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: w.id,
    name: w.name,
    address: w.address,
    network: w.network,
    active: w.active,
    displayOrder: w.displayOrder,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

// List all managed deposit wallets (ordered).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);
  const rows = await prisma.depositWallet.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return ok(rows.map(serialize));
}

// Create a wallet.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = depositWalletSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { name, address, network, active, displayOrder } = parsed.data;

  // Same address twice is almost certainly a mistake (and breaks amount-matching).
  const dupe = await prisma.depositWallet.findFirst({ where: { address } });
  if (dupe) return fail("A wallet with that address already exists.", 409);

  // Default new wallets to the end of the list.
  const order =
    displayOrder ??
    ((await prisma.depositWallet.aggregate({ _max: { displayOrder: true } }))._max.displayOrder ?? 0) + 1;

  const w = await prisma.depositWallet.create({
    data: { name, address, network: network || "TRC20", active: active ?? true, displayOrder: order },
  });
  await audit("admin.deposit_wallet.create", { userId: admin.id, detail: { id: w.id, name, address } });
  return ok(serialize(w));
}

// Update a wallet (name/address/network/active/displayOrder).
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = depositWalletUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { id, ...rest } = parsed.data;

  const existing = await prisma.depositWallet.findUnique({ where: { id } });
  if (!existing) return fail("Wallet not found.", 404);

  if (rest.address && rest.address !== existing.address) {
    const dupe = await prisma.depositWallet.findFirst({
      where: { address: rest.address, id: { not: id } },
    });
    if (dupe) return fail("A wallet with that address already exists.", 409);
  }

  const w = await prisma.depositWallet.update({ where: { id }, data: rest });
  await audit("admin.deposit_wallet.update", { userId: admin.id, detail: { id, ...rest } });
  return ok(serialize(w));
}

const deleteSchema = z.object({ id: z.string().min(1) });

// Delete a wallet. Users currently locked to it are released so they reassign.
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = deleteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Provide a wallet id.");
  const { id } = parsed.data;

  const existing = await prisma.depositWallet.findUnique({ where: { id } });
  if (!existing) return fail("Wallet not found.", 404);

  // Release any users locked to this wallet so their next visit reassigns.
  await prisma.user.updateMany({ where: { assignedWalletId: id }, data: { assignedWalletId: null } });
  await prisma.depositWallet.delete({ where: { id } });
  await audit("admin.deposit_wallet.delete", { userId: admin.id, detail: { id } });
  return ok({ id });
}
