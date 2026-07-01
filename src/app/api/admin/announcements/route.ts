import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { announcementSchema, firstError } from "@/lib/validation";
import { ok, fail } from "@/lib/http";
import { audit } from "@/lib/audit";
import { z } from "zod";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);
  const items = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
  return ok(items);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = announcementSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));

  const created = await prisma.announcement.create({
    data: { ...parsed.data, active: parsed.data.active ?? true },
  });
  await audit("admin.announcement.create", { userId: admin.id, detail: { id: created.id } });
  return ok(created);
}

const delSchema = z.object({ id: z.string().min(1) });

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);
  const parsed = delSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Invalid request.");
  await prisma.announcement.delete({ where: { id: parsed.data.id } });
  await audit("admin.announcement.delete", { userId: admin.id, detail: parsed.data });
  return ok({ deleted: true });
}
