"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/user-context";
import { CoinIcon } from "./CoinIcon";
import { BrandLogo } from "./BrandLogo";

const HIDE_ON = ["/login", "/register", "/admin"];

export function TopBar() {
  const { me, loading } = useUser();
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <header className="sticky top-0 z-40 bg-[#0f1626]">
      <div className="app-shell">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo size={36} priority />
            <span className="font-display text-base font-extrabold tracking-tight">
              MEGA <span className="brand-gradient">99</span>
            </span>
          </Link>

          {loading ? (
            <div className="skeleton h-9 w-28" />
          ) : me ? (
            <Link
              href="/mine"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1a2438] px-3 py-1.5"
            >
              <CoinIcon className="text-game-gold" size={18} />
              <span className="text-sm font-bold tabular-nums">{me.balanceFmt}</span>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="btn-ghost !px-3 !py-2 text-xs">
                Login
              </Link>
              <Link href="/register" className="btn-blue !px-3 !py-2 text-xs">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
