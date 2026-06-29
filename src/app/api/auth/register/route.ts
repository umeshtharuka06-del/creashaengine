import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionCookie } from "@/lib/auth";
import { registerSchema, firstError } from "@/lib/validation";
import { ok, fail } from "@/lib/http";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { randomServerSeed } from "@/lib/fair";
import { audit } from "@/lib/audit";
import { notifyNewUser } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip}`, 5, 60_000).ok)
    return fail("Too many attempts. Try again later.", 429);

  const parsed = registerSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { email, username, password, ref } = parsed.data;

  const dupe = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (dupe) return fail("Email or username already in use.", 409);

  // Resolve the referrer (if a valid referral code was supplied). The code is
  // the referrer's userId. We only honour it when it points to a real, existing
  // user — invalid/unknown codes are silently ignored so signup still succeeds.
  // referredBy is set ONCE here and never updated, so self-referral is
  // impossible (the new user doesn't exist yet) and existing users can't be
  // reassigned later.
  let referredBy: string | null = null;
  if (ref && /^[a-f0-9]{24}$/i.test(ref)) {
    const referrer = await prisma.user.findUnique({ where: { id: ref } });
    if (referrer) referredBy = referrer.id;
  }

  const passwordHash = await hashPassword(password);

  // New accounts start with a ZERO balance — there is no signup bonus. The wallet
  // is funded only by real deposits.
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        username,
        passwordHash,
        clientSeed: randomServerSeed().slice(0, 16),
        referredBy,
      },
    });
    await tx.wallet.create({ data: { userId: u.id, balance: 0 } });
    return u;
  });

  await audit("user.register", { userId: user.id, ip, detail: { username, referredBy } });
  await notifyNewUser({ username: user.username, uid: user.id });
  await createSessionCookie({
    sub: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });

  return ok({ id: user.id, username: user.username, email: user.email });
}
