"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { CoinIcon } from "@/components/CoinIcon";
import { DataTable, type Column } from "./DataTable";

interface Row {
  id: string;
  user: string;
  coinsFmt: string;
  usdt: number;
  feeUsdt: number;
  receiveUsdt: number;
  address: string;
  status: string;
  txid: string | null;
  createdAt: string;
}

const FILTERS = ["PENDING", "APPROVED", "COMPLETED", "REJECTED", "ALL"] as const;
const BADGE: Record<string, string> = {
  PENDING: "bg-royal-blue/15 text-royal-blue-bright",
  APPROVED: "bg-mega-gold/15 text-game-gold",
  COMPLETED: "bg-game-green/15 text-game-green",
  REJECTED: "bg-game-red/15 text-game-red-bright",
};

export function CryptoWithdrawalsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PENDING");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const qs = filter === "ALL" ? "" : `?status=${filter}`;
    const r = await api<Row[]>(`/api/admin/crypto/withdrawals${qs}`);
    if (r.ok) setRows(r.data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 8000); // live queue
    return () => clearInterval(t);
  }, [load]);

  async function act(id: string, action: "approve" | "reject" | "complete") {
    let txid: string | undefined;
    if (action === "complete") {
      txid = window.prompt("Paste the on-chain TXID of the USDT you sent:") || undefined;
      if (!txid) return;
    }
    if (action === "reject" && !window.confirm("Reject and refund the held coins?")) return;
    setBusy(id + action);
    await api("/api/admin/crypto/withdrawals", { json: { id, action, txid } });
    setBusy("");
    load();
  }

  const columns: Column<Row>[] = [
    { key: "user", label: "User", sort: (r) => r.user, render: (r) => <span className="font-medium text-slate-100">{r.user}</span> },
    {
      key: "coins",
      label: "Coins",
      sort: (r) => r.usdt,
      csv: (r) => r.coinsFmt,
      render: (r) => <span className="whitespace-nowrap text-game-gold"><CoinIcon /> {r.coinsFmt}</span>,
    },
    { key: "usdt", label: "USDT", sort: (r) => r.usdt, render: (r) => <span className="text-slate-200">{r.usdt.toFixed(2)}</span> },
    { key: "fee", label: "Fee", csv: (r) => r.feeUsdt, render: (r) => <span className="text-slate-400">{r.feeUsdt.toFixed(2)}</span> },
    { key: "receive", label: "Receive", sort: (r) => r.receiveUsdt, render: (r) => <span className="font-semibold text-game-green">{r.receiveUsdt.toFixed(2)}</span> },
    {
      key: "address",
      label: "Destination wallet",
      csv: (r) => r.address,
      render: (r) => (
        <span className="block max-w-[220px] break-all font-mono text-[11px] text-royal-blue-bright" title={r.address}>
          {r.address}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sort: (r) => r.status,
      render: (r) => (
        <span>
          <span className={`chip ${BADGE[r.status] ?? "bg-white/5 text-slate-300"}`}>{r.status}</span>
          {r.txid && <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{r.txid.slice(0, 12)}…</span>}
        </span>
      ),
    },
    {
      key: "createdAt",
      label: "Date",
      sort: (r) => r.createdAt,
      csv: (r) => new Date(r.createdAt).toISOString(),
      render: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      thClassName: "text-right",
      tdClassName: "text-right",
      render: (r) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          {r.status === "PENDING" && (
            <button onClick={() => act(r.id, "approve")} disabled={!!busy} className="chip bg-royal-blue/15 text-royal-blue-bright">approve</button>
          )}
          {(r.status === "PENDING" || r.status === "APPROVED") && (
            <>
              <button onClick={() => act(r.id, "complete")} disabled={!!busy} className="chip bg-game-green/15 text-game-green">complete</button>
              <button onClick={() => act(r.id, "reject")} disabled={!!busy} className="chip bg-game-red/15 text-game-red-bright">reject</button>
            </>
          )}
          {(r.status === "COMPLETED" || r.status === "REJECTED") && <span className="text-[11px] text-slate-600">—</span>}
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
      {FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => setFilter(f)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            filter === f ? "bg-royal-blue text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      search={(r) => `${r.user} ${r.address} ${r.txid ?? ""}`}
      searchPlaceholder="Search user / wallet / TXID…"
      dateKey={(r) => r.createdAt}
      filename="withdrawals"
      toolbar={toolbar}
      minWidth={980}
      emptyText="No withdrawal requests."
    />
  );
}
