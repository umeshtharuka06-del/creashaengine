"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Pager } from "./GameHistoryTab";

interface Log {
  id: string;
  action: string;
  user: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}
interface Pagination {
  page: number;
  totalPages: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function LogsTab() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Log[]>([]);
  const [pg, setPg] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (action.trim()) params.set("action", action.trim());
    const res = await api<{ logs: Log[]; pagination: Pagination }>(
      `/api/admin/logs?${params}`
    );
    if (res.ok && res.data) {
      setRows(res.data.logs);
      setPg(res.data.pagination);
    }
    setLoading(false);
  }, [action, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="card space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), load())}
          placeholder="Filter by action (e.g. user.login)…"
          className="input max-w-[280px]"
        />
        <button onClick={() => (setPage(1), load())} className="btn-ghost">
          Filter
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              <th className="py-2 pr-3">Time</th>
              <th className="pr-3">Action</th>
              <th className="pr-3">User</th>
              <th className="pr-3">IP</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-slate-500">
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td className="pr-3 font-mono text-slate-200">{l.action}</td>
                <td className="text-slate-400">{l.user ?? "—"}</td>
                <td className="text-slate-400">{l.ip ?? "—"}</td>
                <td className="max-w-[280px] truncate text-xs text-slate-500" title={l.detail ?? ""}>
                  {l.detail ?? "—"}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No log entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager pg={pg} loading={loading} onPage={setPage} />
    </div>
  );
}
