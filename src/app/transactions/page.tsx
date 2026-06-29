"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { useUser } from "@/lib/user-context";
import { CoinIcon } from "@/components/CoinIcon";

interface Txn {
  id: string;
  type: string;
  amountFmt: string;
  amount: number;
  createdAt: string;
}

const LABEL: Record<string, string> = {
  SIGNUP_BONUS: "Welcome bonus",
  BET: "Bet placed",
  PAYOUT: "Payout",
  ADMIN_CREDIT: "Admin credit",
  ADMIN_DEBIT: "Admin debit",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
};

export default function TransactionsPage() {
  const { me, loading } = useUser();
  const router = useRouter();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !me) router.replace("/login?next=/transactions");
  }, [loading, me, router]);

  const load = useCallback(async () => {
    const r = await api<{ transactions: Txn[] }>("/api/wallet");
    if (r.ok && r.data) setTxns(r.data.transactions);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!me) return;
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [me, load]);

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black">Transactions</h1>
        <Link href="/mine" className="text-xs font-semibold text-game-gold">
          ← Back
        </Link>
      </div>

      <div className="card p-4">
        {busy ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : txns.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No transactions yet.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium text-slate-200">
                    {LABEL[t.type] || t.type}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(t.createdAt).toLocaleString()}
                  </div>
                </div>
                <div
                  className={`flex items-center gap-1 text-sm font-bold tabular-nums ${
                    t.amount >= 0 ? "text-game-green" : "text-slate-300"
                  }`}
                >
                  {t.amount >= 0 ? "+" : ""}
                  <CoinIcon /> {t.amountFmt}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
