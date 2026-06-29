"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "./client";

export interface Me {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  balance: number;
  balanceFmt: string;
  clientSeed?: string;
  createdAt: string;
}

interface UserCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Optimistically set the formatted balance (e.g. right after a bet/payout). */
  setBalanceFmt: (fmt: string, raw?: number) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<UserCtx | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await api<Me>("/api/auth/me");
      setMe(res.ok ? res.data! : null);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, []);

  const setBalanceFmt = useCallback((fmt: string, raw?: number) => {
    setMe((cur) =>
      cur ? { ...cur, balanceFmt: fmt, balance: raw ?? cur.balance } : cur
    );
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setMe(null);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    // Poll the balance so the wallet stays in sync without a manual refresh
    // (payouts are credited by the engine service, outside this tab).
    const t = setInterval(refresh, 10_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [refresh]);

  return (
    <Ctx.Provider value={{ me, loading, refresh, setBalanceFmt, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
