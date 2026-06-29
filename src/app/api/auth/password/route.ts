import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { changePasswordSchema, firstError } from "@/lib/validation";
import { ok, fail, handleError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

// Change the signed-in user's password. Requires the current password.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return fail("Not authenticated.", 401);

  if (!rateLimit(`password:${user.id}`, 5, 60_000).ok)
    return fail("Too many attempts. Try again later.", 429);

  const parsed = changePasswordSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { currentPassword, newPassword } = parsed.data;

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    await audit("user.password.change.fail", { userId: user.id });
    return fail("Current password is incorrect.", 401);
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await audit("user.password.change", { userId: user.id });
    return ok({ changed: true });
  } catch (e) {
    return handleError(e);
  }
}
