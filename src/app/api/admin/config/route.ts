import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAllSettings, setSetting } from "@/lib/settings";
import { settingSchema, firstError } from "@/lib/validation";
import { ok, fail } from "@/lib/http";
import { audit } from "@/lib/audit";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);
  return ok(await getAllSettings());
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const parsed = settingSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));

  await setSetting(parsed.data.key, parsed.data.value);
  await audit("admin.config.set", { userId: admin.id, detail: parsed.data });
  return ok(await getAllSettings());
}
