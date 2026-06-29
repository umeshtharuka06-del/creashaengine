"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDE_ON = ["/login", "/register", "/admin"];

// Only four destinations: Home · WinGo · Crash · Mine.
const TABS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/game", label: "WinGo", icon: DiceIcon },
  { href: "/games/crash", label: "Crash", icon: RocketIcon },
  { href: "/mine", label: "Mine", icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50">
      <div className="app-shell px-3 pb-3">
        <div className="flex items-stretch justify-between rounded-2xl border border-white/10 bg-[#161f33] px-2 py-1.5">
          {TABS.map((t) => {
            const active = isActive(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2"
              >
                <Icon
                  className={`h-6 w-6 transition ${
                    active ? "text-royal-blue-bright" : "text-slate-500"
                  }`}
                />
                <span
                  className={`text-[11px] font-semibold transition ${
                    active ? "text-white" : "text-slate-500"
                  }`}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ── Inline icons (no extra deps) ── */
type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function DiceIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
function RocketIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
      <path d="M12.5 4.5C16 2 21 3 21 3s1 5-1.5 8.5L14 17l-3-3 1.5-9.5Z" />
      <circle cx="15" cy="9" r="1.5" />
    </svg>
  );
}
function UserIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
