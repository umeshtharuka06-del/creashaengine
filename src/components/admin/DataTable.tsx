"use client";

import { useMemo, useState, type ReactNode } from "react";

// ────────────────────────────────────────────────────────────────────────────
// Reusable admin table: client-side search, column sort, date-range filter,
// pagination, CSV export, loading skeleton + empty state, responsive scroll.
// Parents pass already-fetched rows and (optionally) a status-filter toolbar.
// ────────────────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  /** value used for sorting + CSV; presence makes the column sortable */
  sort?: (row: T) => string | number;
  /** override CSV value (defaults to `sort`, then the rendered text is skipped) */
  csv?: (row: T) => string | number;
  thClassName?: string;
  tdClassName?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** searchable text for a row (case-insensitive substring match) */
  search?: (row: T) => string;
  searchPlaceholder?: string;
  /** ISO date string for the date-range filter (enables the date inputs) */
  dateKey?: (row: T) => string;
  filename?: string;
  toolbar?: ReactNode;
  pageSize?: number;
  minWidth?: number;
  emptyText?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  search,
  searchPlaceholder = "Search…",
  dateKey,
  filename = "export",
  toolbar,
  pageSize = 10,
  minWidth = 720,
  emptyText = "No records.",
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortIdx, setSortIdx] = useState<number | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
    if (q && search) out = out.filter((r) => search(r).toLowerCase().includes(q));
    if (dateKey && (from || to)) {
      const lo = from ? new Date(from).getTime() : -Infinity;
      const hi = to ? new Date(to).getTime() + 24 * 3600_000 : Infinity; // inclusive day
      out = out.filter((r) => {
        const t = new Date(dateKey(r)).getTime();
        return t >= lo && t <= hi;
      });
    }
    if (sortIdx != null && columns[sortIdx]?.sort) {
      const acc = columns[sortIdx].sort!;
      out = [...out].sort((a, b) => {
        const av = acc(a);
        const bv = acc(b);
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, query, search, dateKey, from, to, sortIdx, dir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(i: number) {
    if (!columns[i].sort) return;
    if (sortIdx === i) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortIdx(i);
      setDir("desc");
    }
  }

  function exportCsv() {
    const cols = columns.filter((c) => c.csv || c.sort);
    const header = cols.map((c) => csvCell(c.label));
    const lines = filtered.map((r) =>
      cols.map((c) => csvCell((c.csv ?? c.sort)!(r))).join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card p-4 md:p-5">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {toolbar}
        {search && (
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="input !w-auto flex-1 !py-1.5 text-xs sm:min-w-[180px]"
          />
        )}
        {dateKey && (
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="input !w-auto !py-1.5 text-xs" />
            <span>–</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="input !w-auto !py-1.5 text-xs" />
          </div>
        )}
        <button onClick={exportCsv} disabled={filtered.length === 0} className="btn-ghost !py-1.5 text-xs">
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <thead className="text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(i)}
                  className={`py-2 pr-3 ${c.sort ? "cursor-pointer select-none hover:text-slate-300" : ""} ${c.thClassName ?? ""}`}
                >
                  {c.label}
                  {sortIdx === i && <span className="ml-1">{dir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={columns.length} className="py-2.5">
                    <div className="skeleton h-6 w-full rounded" />
                  </td>
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-slate-400">
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr key={rowKey(r)}>
                  {columns.map((c) => (
                    <td key={c.key} className={`py-2.5 pr-3 ${c.tdClassName ?? ""}`}>
                      {c.render ? c.render(r) : c.sort ? String(c.sort(r)) : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            {filtered.length} record{filtered.length === 1 ? "" : "s"}
            {rows.length !== filtered.length && ` (of ${rows.length})`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="btn-ghost !px-3 !py-1 disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span>
              Page {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="btn-ghost !px-3 !py-1 disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
