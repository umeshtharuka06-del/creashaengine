"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { CoinIcon } from "@/components/CoinIcon";

interface AdminUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  isBanned: boolean;
  balance: number;
  balanceFmt: string;
  createdAt: string;
}

type SortKey = "username" | "balance" | "createdAt";
const PAGE_SIZE = 10;

export function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const res = await api<AdminUser[]>(`/api/admin/users?q=${encodeURIComponent(q)}`);
    if (res.ok) setUsers(res.data || []);
  }, [q]);

  // Debounce the search.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const sorted = useMemo(() => {
    const arr = [...users];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "username") cmp = a.username.localeCompare(b.username);
      else if (sortKey === "balance") cmp = a.balance - b.balance;
      else cmp = +new Date(a.createdAt) - +new Date(b.createdAt);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [users, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [q, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "username" ? "asc" : "desc");
    }
  }

  async function act(userId: string, action: string, amount?: number) {
    setBusy(userId + action);
    await api("/api/admin/users", { json: { userId, action, amount } });
    setBusy("");
    load();
  }

  function adjust(u: AdminUser, sign: 1 | -1) {
    const raw = prompt(`${sign > 0 ? "Credit" : "Debit"} how many coins for ${u.username}?`);
    const amount = Number(raw);
    if (!amount || amount <= 0) return;
    act(u.id, sign > 0 ? "credit" : "debit", amount);
  }

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="card p-4 md:p-5">
      {/* Search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 md:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            ⌕
          </span>
          <input
            className="input !pl-9"
            placeholder="Search email or username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="text-xs text-slate-500">{sorted.length} users</span>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              <th className="cursor-pointer select-none py-2 pr-3" onClick={() => toggleSort("username")}>
                User{arrow("username")}
              </th>
              <th className="cursor-pointer select-none pr-3" onClick={() => toggleSort("balance")}>
                Balance{arrow("balance")}
              </th>
              <th className="pr-3">Role / Status</th>
              <th className="cursor-pointer select-none pr-3" onClick={() => toggleSort("createdAt")}>
                Joined{arrow("createdAt")}
              </th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {pageRows.map((u) => (
              <tr key={u.id}>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.username} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-100">{u.username}</div>
                      <div className="truncate text-xs text-slate-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap pr-3 font-semibold text-game-gold">
                  <CoinIcon /> {u.balanceFmt}
                </td>
                <td className="pr-3">
                  <Badges u={u} />
                </td>
                <td className="whitespace-nowrap pr-3 text-xs text-slate-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td>
                  <Actions u={u} busy={busy} act={act} adjust={adjust} />
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {pageRows.map((u) => (
          <div key={u.id} className="rounded-xl border border-white/10 bg-[#0f1626] p-3">
            <div className="flex items-center gap-3">
              <Avatar name={u.username} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-100">{u.username}</div>
                <div className="truncate text-xs text-slate-500">{u.email}</div>
              </div>
              <div className="whitespace-nowrap text-sm font-semibold text-game-gold">
                <CoinIcon /> {u.balanceFmt}
              </div>
            </div>
            <div className="mt-2">
              <Badges u={u} />
            </div>
            <div className="mt-3">
              <Actions u={u} busy={busy} act={act} adjust={adjust} />
            </div>
          </div>
        ))}
        {pageRows.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400">No users found.</div>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-ghost !py-2 text-xs"
          >
            ← Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-ghost !py-2 text-xs"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-royal-blue text-xs font-black text-white">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Badges({ u }: { u: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`chip ${
          u.isAdmin ? "bg-game-gold/20 text-game-gold" : "bg-white/5 text-slate-400"
        }`}
      >
        {u.isAdmin ? "Admin" : "Player"}
      </span>
      <span
        className={`chip ${
          u.isBanned ? "bg-game-red/20 text-game-red-bright" : "bg-game-green/15 text-game-green"
        }`}
      >
        {u.isBanned ? "Banned" : "Active"}
      </span>
    </div>
  );
}

function Actions({
  u,
  busy,
  act,
  adjust,
}: {
  u: AdminUser;
  busy: string;
  act: (userId: string, action: string, amount?: number) => void;
  adjust: (u: AdminUser, sign: 1 | -1) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 md:justify-end">
      <button
        onClick={() => adjust(u, 1)}
        className="chip bg-game-green/15 text-game-green active:bg-game-green/25"
      >
        + coins
      </button>
      <button
        onClick={() => adjust(u, -1)}
        className="chip bg-white/5 text-slate-300 active:bg-white/10"
      >
        − coins
      </button>
      <button
        onClick={() => act(u.id, u.isBanned ? "unban" : "ban")}
        disabled={!!busy}
        className="chip bg-game-red/15 text-game-red-bright active:bg-game-red/25"
      >
        {u.isBanned ? "unban" : "ban"}
      </button>
      <button
        onClick={() => act(u.id, u.isAdmin ? "removeAdmin" : "makeAdmin")}
        disabled={!!busy}
        className="chip bg-royal-blue/15 text-royal-blue-bright active:bg-royal-blue/25"
      >
        {u.isAdmin ? "demote" : "promote"}
      </button>
    </div>
  );
}
