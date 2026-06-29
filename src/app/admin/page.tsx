"use client";

import { useState } from "react";
import Link from "next/link";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { GameHistoryTab } from "@/components/admin/GameHistoryTab";
import { LogsTab } from "@/components/admin/LogsTab";
import { ForceResultTab } from "@/components/admin/ForceResultTab";
import { AnnouncementsTab } from "@/components/admin/AnnouncementsTab";
import { ConfigTab } from "@/components/admin/ConfigTab";
import { DepositsTab } from "@/components/admin/DepositsTab";
import { CryptoWithdrawalsTab } from "@/components/admin/CryptoWithdrawalsTab";
import { DepositWalletsTab } from "@/components/admin/DepositWalletsTab";
import { TelegramTab } from "@/components/admin/TelegramTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "force", label: "Force Result" },
  { key: "deposits", label: "Deposits" },
  { key: "withdrawals", label: "Withdrawals" },
  { key: "wallets", label: "Deposit Wallets" },
  { key: "telegram", label: "Telegram" },
  { key: "history", label: "Game History" },
  { key: "logs", label: "System Logs" },
  { key: "announcements", label: "Announcements" },
  { key: "config", label: "Config" },
] as const;

export default function AdminPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white md:text-3xl">Admin Console</h1>
          <p className="text-sm text-slate-400">Manage games, users and the platform.</p>
        </div>
        <Link href="/" className="btn-ghost !py-2 text-sm">
          ← Back to app
        </Link>
      </div>

      {/* Tab bar — scrolls horizontally on small screens, no overflow elsewhere */}
      <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
        <div className="inline-flex min-w-full gap-1 rounded-2xl border border-white/10 bg-[#161f33] p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                tab === t.key
                  ? "bg-royal-blue text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "force" && <ForceResultTab />}
      {tab === "deposits" && <DepositsTab />}
      {tab === "withdrawals" && <CryptoWithdrawalsTab />}
      {tab === "wallets" && <DepositWalletsTab />}
      {tab === "telegram" && <TelegramTab />}
      {tab === "history" && <GameHistoryTab />}
      {tab === "logs" && <LogsTab />}
      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "config" && <ConfigTab />}
    </div>
  );
}
