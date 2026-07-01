"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "parity_round_seconds", label: "Parity round (s)", hint: "Round length for Parity" },
  { key: "sapre_round_seconds", label: "Sapre round (s)", hint: "Round length for Sapre" },
  { key: "bcone_round_seconds", label: "Bcone round (s)", hint: "Round length for Bcone" },
  { key: "emerd_round_seconds", label: "Emerd round (s)", hint: "Round length for Emerd" },
  { key: "prediction_lock_seconds", label: "Prediction lock window (s)", hint: "Betting closes N s before draw" },
  { key: "prediction_heavy_win_rate", label: "Heavy win rate (0–1)", hint: "How often the most-backed side wins" },
  { key: "crash_betting_seconds", label: "Crash betting window (s)", hint: "Time to place a crash bet" },
  { key: "crash_house_edge_pct", label: "Crash house edge (%)", hint: "Instant-bust probability" },
  { key: "crash_auto_cashout_enabled", label: "Crash auto-cashout", hint: "true / false — show the auto-cashout field" },
  { key: "house_fee_enabled", label: "House fee enabled", hint: "true / false" },
  { key: "house_fee_type", label: "House fee type", hint: "percentage / flat" },
  { key: "house_fee_value", label: "House fee value", hint: "2 = 2% (percentage) or 2 coins (flat)" },
];

export function ConfigTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");

  async function load() {
    const res = await api<Record<string, string>>("/api/admin/config");
    if (res.ok) setSettings(res.data || {});
  }
  useEffect(() => {
    load();
  }, []);

  async function save(key: string) {
    await api("/api/admin/config", { json: { key, value: settings[key] ?? "" } });
    setSaved(key);
    setTimeout(() => setSaved(""), 1500);
  }

  return (
    <div className="card p-4 md:p-5">
      <h3 className="mb-4 text-sm font-bold text-white">Platform configuration</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              {f.label}
            </label>
            <div className="flex gap-2">
              <input
                className="input"
                value={settings[f.key] ?? ""}
                onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
              />
              <button onClick={() => save(f.key)} className="btn-ghost">
                {saved === f.key ? "✓" : "Save"}
              </button>
            </div>
            <div className="mt-1 text-xs text-slate-500">{f.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
