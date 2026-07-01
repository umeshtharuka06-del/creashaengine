"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { CoinIcon } from "@/components/CoinIcon";
import { DataTable, type Column } from "./DataTable";

interface Row {
  id: string;
  user: string;
  uid: string;
  amountUsdt: number;
  coinsFmt: string;
  wallet: string;
  walletAddress: string;
  network: string;
  txid: string | null;
  confirmations: number;
  status: string;
  createdAt: string;
}

const FILTERS = ["PENDING", "APPROVED", "REJECTED", "ALL"] as const;
const BADGE: Record<string, string> = {
  PENDING: "bg-royal-blue/15 text-royal-blue-bright",
  APPROVED: "bg-game-green/15 text-game-green",
  REJECTED: "bg-game-red/15 text-game-red-bright",
};

export function DepositsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PENDING");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const qs = filter === "ALL" ? "" : `?status=${filter}`;
    const r = await api<Row[]>(`/api/admin/crypto/deposits${qs}`);
    if (r.ok) setRows(r.data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 8000); // live queue
    return () => clearInterval(t);
  }, [load]);

  async function act(id: string, action: "approve" | "reject", current: Row) {
    let txid: string | undefined;
    let note: string | undefined;
    if (action === "approve" && !current.txid) {
      const v = window.prompt("On-chain TXID (optional — leave blank to approve manually):");
      if (v === null) return;
      txid = v.trim() || undefined;
    }
    if (action === "reject") {
      const v = window.prompt("Reason (optional):");
      if (v === null) return;
      note = v.trim() || undefined;
    }
    setBusy(id + action);
    await api("/api/admin/crypto/deposits", { json: { id, action, txid, note } });
    setBusy("");
    load();
  }

  const columns: Column<Row>[] = [
    { key: "user", label: "User", sort: (r) => r.user, render: (r) => <span className="font-medium text-slate-100">{r.user}</span> },
    { key: "uid", label: "UID", csv: (r) => r.uid, render: (r) => <span className="font-mono text-[11px] text-slate-400">{r.uid.slice(-8).toUpperCase()}</span> },
    {
      key: "amount",
      label: "Amount",
      sort: (r) => r.amountUsdt,
      render: (r) => (
        <span className="whitespace-nowrap">
          {r.amountUsdt} USDT <span className="text-slate-500">·</span>{" "}
          <span className="text-game-gold"><CoinIcon /> {r.coinsFmt}</span>
        </span>
      ),
    },
    {
      key: "wallet",
      label: "Wallet",
      sort: (r) => r.wallet,
      csv: (r) => `${r.wallet} ${r.walletAddress}`,
      render: (r) => (
        <div className="max-w-[160px]">
          <div className="text-xs text-slate-200">{r.wallet}</div>
          <div className="truncate font-mono text-[10px] text-slate-500" title={r.walletAddress}>{r.walletAddress}</div>
        </div>
      ),
    },
    {
      key: "txid",
      label: "TXID",
      csv: (r) => r.txid ?? "",
      render: (r) =>
        r.txid ? (
          <a href={`https://tronscan.org/#/transaction/${r.txid}`} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-royal-blue-bright">
            {r.txid.slice(0, 8)}…{r.confirmations ? ` (${r.confirmations})` : ""}
          </a>
        ) : (
          <span className="text-[11px] text-slate-600">—</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      sort: (r) => r.status,
      render: (r) => <span className={`chip ${BADGE[r.status] ?? "bg-white/5 text-slate-300"}`}>{r.status}</span>,
    },
    {
      key: "createdAt",
      label: "Time",
      sort: (r) => r.createdAt,
      csv: (r) => new Date(r.createdAt).toISOString(),
      render: (r) => <span className="whitespace-nowrap text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      thClassName: "text-right",
      tdClassName: "text-right",
      render: (r) =>
        r.status === "PENDING" ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            <button onClick={() => act(r.id, "approve", r)} disabled={!!busy} className="chip bg-game-green/15 text-game-green">approve</button>
            <button onClick={() => act(r.id, "reject", r)} disabled={!!busy} className="chip bg-game-red/15 text-game-red-bright">reject</button>
          </div>
        ) : (
          <span className="text-[11px] text-slate-600">—</span>
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
      search={(r) => `${r.user} ${r.uid} ${r.txid ?? ""} ${r.walletAddress} ${r.wallet}`}
      searchPlaceholder="Search user / UID / TXID…"
      dateKey={(r) => r.createdAt}
      filename="deposits"
      toolbar={toolbar}
      minWidth={920}
      emptyText="No deposit requests."
    />
  );
}
