import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyPassword,
  createSessionCookie,
  ensureBootstrapAdmin,
} from "@/lib/auth";
import { loginSchema, firstError } from "@/lib/validation";
import { ok, fail } from "@/lib/http";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { notifyAdminLogin } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`login:${ip}`, 10, 60_000).ok)
    return fail("Too many attempts. Try again later.", 429);

  const parsed = loginSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { email, password } = parsed.data;

  // Bootstrap the env-configured admin on first login (fixes fresh-deploy
  // "Invalid credentials" when the seed never ran). No-op for everyone else.
  await ensureBootstrapAdmin(email, password);

  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-ish path: always run a compare to reduce user-enumeration timing.
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "$2a$12$" + "x".repeat(53));

  if (!user || !valid) {
    await audit("user.login.fail", { ip, detail: { email } });
    return fail("Invalid email or password.", 401);
  }
  if (user.isBanned) return fail("This account is suspended.", 403);

  await createSessionCookie({
    sub: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  await audit("user.login", { userId: user.id, ip });
  if (user.isAdmin) {
    await notifyAdminLogin({ username: user.username, uid: user.id, ip: ip ?? undefined });
  }

  return ok({
    id: user.id,
    username: user.username,
    email: user.email,
    isAdmin: user.isAdmin,
  });
}
