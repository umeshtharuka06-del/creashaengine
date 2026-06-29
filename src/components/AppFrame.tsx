"use client";

import { usePathname } from "next/navigation";

/**
 * Route-aware page frame.
 *  • Player app  → centered phone-width shell (mobile-first gaming app).
 *  • Admin panel → full desktop-first width container, so tables and grids use
 *    the available screen instead of being crushed into the 480px shell.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-4 md:px-6 lg:px-8">
        {children}
      </main>
    );
  }

  // The home route renders either the full-width public landing or the
  // dashboard (which self-constrains to the app shell), so it controls its own
  // width here — no 100vw breakout hack, no horizontal overflow.
  if (pathname === "/") {
    return <main className="w-full">{children}</main>;
  }

  return (
    <main className="app-shell min-h-screen px-3 pb-28 pt-1">{children}</main>
  );
}
