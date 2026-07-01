import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/jwt";

const PROTECTED = ["/mine", "/transactions", "/deposit", "/withdraw", "/admin"];
const ADMIN_ONLY = ["/admin"];

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF mitigation: reject cross-origin state-changing API requests. SameSite=lax
  // cookies already block most CSRF; this is belt-and-suspenders. Requests with no
  // Origin header (server-to-server, e.g. the cron poller using its secret) pass.
  if (pathname.startsWith("/api") && !SAFE_METHODS.includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.get("host")) {
          return NextResponse.json({ ok: false, error: "Cross-origin request blocked." }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ ok: false, error: "Invalid origin." }, { status: 403 });
      }
    }
  }

  const needsAuth = PROTECTED.some((p) => pathname.startsWith(p));

  let res = NextResponse.next();

  if (needsAuth) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;

    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (ADMIN_ONLY.some((p) => pathname.startsWith(p)) && !session.isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // Baseline security headers
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  return res;
}

export const config = {
  matcher: [
    "/mine/:path*",
    "/transactions/:path*",
    "/deposit/:path*",
    "/withdraw/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
