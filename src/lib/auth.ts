import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./db";
import {
  SESSION_COOKIE,
  SessionPayload,
  signSession,
  verifySession,
} from "./jwt";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/**
 * Idempotent admin bootstrap — makes the env vars the single source of truth.
 *
 * Fixes the production "Invalid credentials" problem. Two root causes are
 * covered:
 *   1. Fresh deploy (e.g. Vercel) where the seed never ran, so the admin row
 *      doesn't exist and the correct email/password is rejected.
 *   2. An admin row that ALREADY exists but whose stored bcrypt hash no longer
 *      matches `ADMIN_PASSWORD` — because it was seeded earlier with a different
 *      password, or the password was rotated in Vercel. The old code returned
 *      the stale row untouched, so `verifyPassword` failed and login kept
 *      reporting "Invalid credentials" even with the correct env vars.
 *
 * If the submitted credentials EXACTLY match the `ADMIN_EMAIL` / `ADMIN_PASSWORD`
 * environment variables we: create the admin (with a wallet) on first login,
 * promote an existing matching user to admin, AND re-sync the stored password
 * hash to the env value when it has drifted. Returns the admin user when it
 * acted, otherwise null.
 *
 * Safe because it only fires for the exact env-configured credentials — the same
 * secret the operator already controls.
 */
export async function ensureBootstrapAdmin(email: string, password: string) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (!adminEmail || !adminPassword) return null;
  if (email.toLowerCase().trim() !== adminEmail || password !== adminPassword)
    return null;

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    // The supplied password already equals ADMIN_PASSWORD (guard above). If the
    // stored hash doesn't verify against it, the row drifted — re-sync it so the
    // env vars remain authoritative. Also (re)assert admin + un-ban.
    const hashMatches = await bcrypt.compare(adminPassword, existing.passwordHash);
    const needsPromote = !existing.isAdmin || existing.isBanned;
    if (!hashMatches || needsPromote) {
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          isAdmin: true,
          isBanned: false,
          ...(hashMatches ? {} : { passwordHash: await bcrypt.hash(adminPassword, 12) }),
        },
      });
    }
    return existing;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  // Derive a unique username from the email local-part, de-duplicating if taken.
  const base = (adminEmail.split("@")[0] || "admin").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16) || "admin";
  let username = base;
  for (let i = 0; await prisma.user.findUnique({ where: { username } }); i++) {
    username = `${base}${i + 1}`;
  }

  return prisma.user.create({
    data: {
      email: adminEmail,
      username,
      passwordHash,
      isAdmin: true,
      clientSeed: crypto.randomBytes(8).toString("hex"),
      wallet: { create: { balance: 0 } },
    },
  });
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Read the session from a route handler / server component. */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Read the session from a NextRequest (for API routes that need the raw req). */
export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Throw-style guard: returns the live user or null if missing/banned. */
export async function requireUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.isBanned) return null;
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user || !user.isAdmin) return null;
  return user;
}
