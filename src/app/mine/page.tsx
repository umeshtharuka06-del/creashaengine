"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useUser } from "@/lib/user-context";
import { CoinIcon } from "@/components/CoinIcon";
import {
  HistoryIcon,
  TrophyIcon,
  AdminIcon,
  LogoutIcon,
  ReferralIcon,
  RechargeIcon,
  WithdrawIcon,
} from "@/components/icons";
import { ChangePassword } from "@/components/ChangePassword";

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
  WITHDRAWAL_REFUND: "Withdrawal refund",
};

const TXN_PREVIEW = 6;

export default function MinePage() {
  const { me, loading, logout } = useUser();
  const router = useRouter();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [copied, setCopied] = useState(false);
  const [refCount, setRefCount] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !me) router.replace("/login?next=/mine");
  }, [loading, me, router]);

  const loadTxns = useCallback(async () => {
    const r = await api<{ transactions: Txn[] }>("/api/wallet");
    if (r.ok && r.data) setTxns(r.data.transactions);
  }, []);

  // Poll transactions so payouts/credits appear without a manual refresh.
  useEffect(() => {
    if (!me) return;
    loadTxns();
    const t = setInterval(loadTxns, 8000);
    return () => clearInterval(t);
  }, [me, loadTxns]);

  // Referral link carries the referrer's full userId so the register API can
  // resolve and persist the relationship.
  const referral =
    typeof window !== "undefined" && me
      ? `${window.location.origin}/register?ref=${me.id}`
      : "https://mega99.app/register";

  useEffect(() => {
    if (!me) return;
    const load = () =>
      api<{ count: number }>("/api/me/referrals").then(
        (r) => r.ok && r.data && setRefCount(r.data.count)
      );
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [me]);

  if (!me) {
    return (
      <div className="space-y-3 py-2">
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {/* Identity */}
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-royal-blue text-2xl font-black text-white">
            {me.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-black">{me.username}</h1>
              {me.isAdmin && (
                <span className="chip bg-game-gold/20 text-game-gold">Admin</span>
              )}
            </div>
            <div className="truncate text-sm text-slate-400">{me.email}</div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500">
              ID: {me.id.slice(-8).toUpperCase()}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-[#0f1626] px-4 py-3">
          <span className="text-sm text-slate-400">Balance</span>
          <span className="flex items-center gap-1.5 text-lg font-black text-game-gold">
            <CoinIcon /> {me.balanceFmt}
          </span>
        </div>
      </div>

      {/* Deposit / Withdraw — USDT (TRC20) */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/deposit" className="btn-gold">
            <RechargeIcon className="h-4 w-4" /> Deposit
          </Link>
          <Link href="/withdraw" className="btn-ghost">
            <WithdrawIcon className="h-4 w-4" /> Withdraw
          </Link>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          USDT on TRON (TRC20). Send to your assigned wallet, tap “I Have Paid”,
          and coins are credited once your deposit is verified.
        </p>
      </div>

      {/* Referral */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ReferralIcon className="h-4 w-4 text-game-gold" /> Referral — invite & earn
          </div>
          <span className="chip bg-mega-gold/15 text-game-gold">
            {refCount ?? 0} invited
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Share your link. Friends who join from it are linked to your account.
        </p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={referral} className="input flex-1 !py-2 text-xs" />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(referral);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn-blue !px-4 !py-2 text-xs"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Transactions — preview only; full list lives on /transactions */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Transactions</h2>
          {txns.length > 0 && (
            <Link href="/transactions" className="text-xs font-semibold text-game-gold">
              View all →
            </Link>
          )}
        </div>
        {txns.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            No transactions yet.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {txns.slice(0, TXN_PREVIEW).map((t) => (
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

      {/* Settings */}
      <div className="card divide-y divide-white/5 p-2">
        <Row href="/history" icon={HistoryIcon} label="Game history" />
        <Row href="/mywin" icon={TrophyIcon} label="My bets" />
        {me.isAdmin && <Row href="/admin" icon={AdminIcon} label="Admin panel" />}
      </div>

      {/* Change password */}
      <ChangePassword />

      <div className="px-1 text-center text-[11px] text-slate-600">
        Member since {new Date(me.createdAt).toLocaleDateString()}
      </div>

      <button
        onClick={async () => {
          await logout();
          router.push("/");
        }}
        className="btn-red w-full"
      >
        <LogoutIcon className="h-4 w-4" /> Log out
      </button>
    </div>
  );
}

function Row({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: (p: { className?: string }) => React.ReactNode;
  label: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-3 py-3 transition active:bg-white/5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0f1626] text-slate-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 text-sm font-medium text-slate-200">{label}</span>
      <span className="text-slate-500">›</span>
    </Link>
  );
}
