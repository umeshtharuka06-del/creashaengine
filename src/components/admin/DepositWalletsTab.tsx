"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

interface Wallet {
  id: string;
  name: string;
  address: string;
  network: string;
  active: boolean;
  displayOrder: number;
}

const PAYMENT_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "crypto_auto_credit", label: "Auto-credit deposits", hint: "true / false — poller credits matched transfers" },
  { key: "crypto_usdt_contract", label: "USDT contract", hint: "TRC20 USDT contract address" },
  { key: "crypto_min_deposit_usdt", label: "Minimum deposit (USDT)", hint: "Below this is rejected" },
  { key: "crypto_min_withdraw_coins", label: "Minimum withdrawal (coins)", hint: "1000 = 10 USDT" },
  { key: "crypto_withdraw_fee_usdt", label: "Withdrawal fee (USDT)", hint: "Flat fee per withdrawal" },
  { key: "crypto_coins_per_usdt", label: "Coins per USDT", hint: "Conversion rate (e.g. 100)" },
  { key: "crypto_confirmations", label: "Confirmations", hint: "Blocks to wait (e.g. 20)" },
  { key: "crypto_poll_seconds", label: "Poll interval (s)", hint: "How often the cron polls (e.g. 30)" },
];

const EMPTY = { name: "", address: "", network: "TRC20" };

export function DepositWalletsTab() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [draft, setDraft] = useState(EMPTY);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const r = await api<Wallet[]>("/api/admin/deposit-wallets");
    if (r.ok) setWallets(r.data || []);
  }, []);
  const loadSettings = useCallback(async () => {
    const r = await api<Record<string, string>>("/api/admin/config");
    if (r.ok) setSettings(r.data || {});
  }, []);

  useEffect(() => {
    load();
    loadSettings();
  }, [load, loadSettings]);

  async function add() {
    setMsg(null);
    if (!draft.name.trim() || !draft.address.trim())
      return setMsg({ text: "Name and address are required.", ok: false });
    setBusy(true);
    const r = await api("/api/admin/deposit-wallets", { json: draft });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error || "Could not add wallet.", ok: false });
    setDraft(EMPTY);
    setMsg({ text: "Wallet added.", ok: true });
    load();
  }

  async function patch(id: string, data: Partial<Wallet>) {
    const r = await api("/api/admin/deposit-wallets", { method: "PATCH", json: { id, ...data } });
    if (!r.ok) setMsg({ text: r.error || "Update failed.", ok: false });
    load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this wallet? Users locked to it will be reassigned.")) return;
    await api("/api/admin/deposit-wallets", { method: "DELETE", json: { id } });
    load();
  }

  async function saveSetting(key: string) {
    await api("/api/admin/config", { json: { key, value: settings[key] ?? "" } });
    setSaved(key);
    setTimeout(() => setSaved(""), 1500);
  }

  const activeCount = wallets.filter((w) => w.active).length;

  return (
    <div className="space-y-5">
      {/* Wallet manager */}
      <div className="card p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white">Deposit wallets</h3>
          <span className="text-xs text-slate-500">
            {wallets.length} total · {activeCount} active (users are randomly assigned an active one)
          </span>
        </div>

        {activeCount === 0 && (
          <div className="mb-3 rounded-xl bg-game-red/10 px-3 py-2 text-xs text-game-red-bright">
            ⚠ No active wallets — users cannot deposit until at least one is active.
          </div>
        )}

        {/* Add form */}
        <div className="mb-4 grid gap-2 rounded-xl bg-[#0f1626] p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
          <input
            placeholder="Name (e.g. Wallet 1)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="input !py-2 text-xs"
          />
          <input
            placeholder="TRC20 address (T...)"
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            className="input !py-2 font-mono text-xs"
          />
          <input
            placeholder="Network"
            value={draft.network}
            onChange={(e) => setDraft({ ...draft, network: e.target.value })}
            className="input !w-24 !py-2 text-xs"
          />
          <button onClick={add} disabled={busy} className="btn-gold !px-4 !py-2 text-xs">
            {busy ? "Adding…" : "Add wallet"}
          </button>
        </div>
        {msg && (
          <div className={`mb-3 text-xs ${msg.ok ? "text-game-green" : "text-game-red-bright"}`}>
            {msg.text}
          </div>
        )}

        {/* List */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-white/10">
                <th className="py-2 pr-3">Order</th>
                <th className="pr-3">Name</th>
                <th className="pr-3">Address</th>
                <th className="pr-3">Network</th>
                <th className="pr-3">Active</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {wallets.map((w) => (
                <tr key={w.id}>
                  <td className="py-2.5 pr-3">
                    <input
                      type="number"
                      defaultValue={w.displayOrder}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== w.displayOrder) patch(w.id, { displayOrder: v });
                      }}
                      className="input !w-16 !py-1 text-xs"
                    />
                  </td>
                  <td className="pr-3">
                    <input
                      defaultValue={w.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== w.name && patch(w.id, { name: e.target.value.trim() })}
                      className="input !py-1 text-xs"
                    />
                  </td>
                  <td className="max-w-[220px] pr-3">
                    <input
                      defaultValue={w.address}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== w.address && patch(w.id, { address: e.target.value.trim() })}
                      className="input !py-1 font-mono text-[11px]"
                    />
                  </td>
                  <td className="pr-3 text-xs text-slate-400">{w.network}</td>
                  <td className="pr-3">
                    <button
                      onClick={() => patch(w.id, { active: !w.active })}
                      className={`chip ${w.active ? "bg-game-green/15 text-game-green" : "bg-white/5 text-slate-400"}`}
                    >
                      {w.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => remove(w.id)}
                      className="chip bg-game-red/15 text-game-red-bright"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {wallets.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No deposit wallets yet. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment settings */}
      <div className="card p-4 md:p-5">
        <h3 className="mb-4 text-sm font-bold text-white">Payment settings</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAYMENT_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-slate-300">{f.label}</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  value={settings[f.key] ?? ""}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                />
                <button onClick={() => saveSetting(f.key)} className="btn-ghost">
                  {saved === f.key ? "✓" : "Save"}
                </button>
              </div>
              <div className="mt-1 text-xs text-slate-500">{f.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
