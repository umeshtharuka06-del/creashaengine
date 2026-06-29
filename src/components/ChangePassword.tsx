"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { EyeIcon, EyeOffIcon, SettingsIcon } from "./icons";

/**
 * In-place change-password form (lives inside the Mine account hub).
 * Uses the same uncontrolled-input + FormData approach as the login form so
 * browser-autofilled values are captured and fields are never wiped on error.
 */
export function ChangePassword() {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const currentPassword = String(fd.get("currentPassword") || "");
    const newPassword = String(fd.get("newPassword") || "");
    if (!currentPassword || !newPassword) {
      setMsg({ text: "Fill in both fields.", ok: false });
      return;
    }

    setBusy(true);
    setMsg(null);
    const res = await api("/api/auth/password", {
      json: { currentPassword, newPassword },
    });
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: res.error || "Could not change password.", ok: false });
      return;
    }
    setMsg({ text: "Password updated.", ok: true });
    formRef.current?.reset();
  }

  return (
    <div className="card p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0f1626] text-slate-300">
          <SettingsIcon className="h-5 w-5" />
        </span>
        <span className="flex-1 text-left text-sm font-medium text-slate-200">
          Change password
        </span>
        <span className="text-game-gold">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <form ref={formRef} onSubmit={submit} className="mt-4 space-y-3" noValidate>
          <PwInput
            name="currentPassword"
            placeholder="Current password"
            autoComplete="current-password"
            show={showCur}
            onToggle={() => setShowCur((s) => !s)}
          />
          <PwInput
            name="newPassword"
            placeholder="New password (min 8 chars)"
            autoComplete="new-password"
            show={showNew}
            onToggle={() => setShowNew((s) => !s)}
          />
          {msg && (
            <div
              role="alert"
              className={`rounded-lg px-3 py-2 text-sm ${
                msg.ok
                  ? "bg-game-green/15 text-game-green"
                  : "bg-game-red/15 text-game-red-bright"
              }`}
            >
              {msg.text}
            </div>
          )}
          <button disabled={busy} className="btn-gold w-full">
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}

function PwInput({
  name,
  placeholder,
  autoComplete,
  show,
  onToggle,
}: {
  name: string;
  placeholder: string;
  autoComplete: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        name={name}
        type={show ? "text" : "password"}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="input !pr-11"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition active:bg-white/10"
      >
        {show ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
      </button>
    </div>
  );
}
