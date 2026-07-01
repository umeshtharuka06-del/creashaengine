"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

interface Settings {
  telegram_enabled: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_large_deposit_usdt: string;
  telegram_large_withdraw_usdt: string;
}

const EMPTY: Settings = {
  telegram_enabled: "false",
  telegram_bot_token: "",
  telegram_chat_id: "",
  telegram_large_deposit_usdt: "1000",
  telegram_large_withdraw_usdt: "1000",
};

const EVENTS = [
  "New user registration",
  "New deposit request",
  "Deposit approved",
  "Withdraw request",
  "Withdraw approved / rejected",
  "Large deposit / withdraw",
  "Admin login",
];

export function TelegramTab() {
  const [s, setS] = useState<Settings>(EMPTY);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "">("");

  useEffect(() => {
    api<Settings>("/api/admin/telegram").then((r) => r.ok && r.data && setS({ ...EMPTY, ...r.data }));
  }, []);

  async function save() {
    setMsg(null);
    setBusy("save");
    const r = await api<Settings>("/api/admin/telegram", { json: { action: "save", settings: s } });
    setBusy("");
    if (r.ok) {
      if (r.data) setS({ ...EMPTY, ...r.data });
      setMsg({ text: "Settings saved.", ok: true });
    } else setMsg({ text: r.error || "Save failed.", ok: false });
  }

  async function test() {
    setMsg(null);
    setBusy("test");
    const r = await api("/api/admin/telegram", {
      json: { action: "test", botToken: s.telegram_bot_token, chatId: s.telegram_chat_id },
    });
    setBusy("");
    setMsg(
      r.ok
        ? { text: "Test message sent — check your Telegram chat.", ok: true }
        : { text: r.error || "Test failed. Check the token and chat id.", ok: false }
    );
  }

  const enabled = s.telegram_enabled === "true";

  return (
    <div className="space-y-5">
      <div className="card p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Telegram notifications</h3>
          <button
            onClick={() => setS({ ...s, telegram_enabled: enabled ? "false" : "true" })}
            className={`chip ${enabled ? "bg-game-green/15 text-game-green" : "bg-white/5 text-slate-400"}`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bot token" hint="From @BotFather">
            <input
              className="input font-mono text-xs"
              value={s.telegram_bot_token}
              onChange={(e) => setS({ ...s, telegram_bot_token: e.target.value })}
              placeholder="123456:ABC-DEF…"
            />
          </Field>
          <Field label="Chat ID" hint="Your chat / channel / group id">
            <input
              className="input font-mono text-xs"
              value={s.telegram_chat_id}
              onChange={(e) => setS({ ...s, telegram_chat_id: e.target.value })}
              placeholder="-1001234567890"
            />
          </Field>
          <Field label="Large deposit alert (USDT)" hint="Flag deposits at/over this">
            <input
              className="input"
              value={s.telegram_large_deposit_usdt}
              onChange={(e) => setS({ ...s, telegram_large_deposit_usdt: e.target.value })}
            />
          </Field>
          <Field label="Large withdraw alert (USDT)" hint="Flag withdrawals at/over this">
            <input
              className="input"
              value={s.telegram_large_withdraw_usdt}
              onChange={(e) => setS({ ...s, telegram_large_withdraw_usdt: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={busy !== ""} className="btn-gold !px-5">
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button onClick={test} disabled={busy !== ""} className="btn-ghost !px-5">
            {busy === "test" ? "Sending…" : "Test notification"}
          </button>
          {msg && (
            <span className={`text-xs ${msg.ok ? "text-game-green" : "text-game-red-bright"}`}>
              {msg.text}
            </span>
          )}
        </div>
      </div>

      <div className="card p-4 md:p-5">
        <h3 className="mb-2 text-sm font-bold text-white">Events sent</h3>
        <ul className="grid gap-1.5 text-xs text-slate-400 sm:grid-cols-2">
          {EVENTS.map((e) => (
            <li key={e} className="flex items-center gap-2">
              <span className="text-game-green">✓</span> {e}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-300">{label}</label>
      {children}
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}
