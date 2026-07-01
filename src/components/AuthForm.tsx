"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { Logo } from "./Logo";
import { EyeIcon, EyeOffIcon } from "./icons";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const isRegister = mode === "register";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // hard guard against double-submit

    // Read straight from the DOM via FormData so browser-autofilled values are
    // always captured. (The previous controlled inputs initialised to "" fought
    // autofill, so the first click submitted empty credentials and "did
    // nothing" until the user retyped — this is the root-cause fix.)
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const username = String(fd.get("username") || "").trim();

    if (!email || !password || (isRegister && !username)) {
      setError("Please fill in all fields.");
      return;
    }

    setBusy(true);
    setError("");
    const ref = params.get("ref") || undefined;
    const path = isRegister ? "/api/auth/register" : "/api/auth/login";
    const json = isRegister ? { email, username, password, ref } : { email, password };
    const res = await api(path, { json });
    setBusy(false);

    // On a recoverable error we NEVER clear the inputs (they are uncontrolled),
    // so the user's email/password stay exactly as typed.
    if (!res.ok) {
      setError(res.error || "Something went wrong. Please try again.");
      return;
    }
    const next = params.get("next") || "/";
    router.push(next);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <div className="card p-6 md:p-8">
        <h1 className="text-2xl font-bold">
          {isRegister ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {isRegister
            ? "Sign up and claim your welcome coins."
            : "Log in to keep playing."}
        </p>

        <form ref={formRef} onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              placeholder="you@example.com"
            />
          </div>

          {isRegister && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Username</label>
              <input
                name="username"
                required
                autoComplete="username"
                className="input"
                placeholder="lucky_player"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Password</label>
            <div className="relative">
              <input
                name="password"
                type={showPw ? "text" : "password"}
                required
                autoComplete={isRegister ? "new-password" : "current-password"}
                className="input !pr-11"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}
                aria-pressed={showPw}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition active:bg-white/10"
              >
                {showPw ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-game-red/40 bg-game-red/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          <button disabled={busy} className="btn-gold w-full">
            {busy ? "Please wait…" : isRegister ? "Create account" : "Log in"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-400">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-game-gold">
                Log in
              </Link>
            </>
          ) : (
            <>
              New to Mega 99?{" "}
              <Link href="/register" className="font-semibold text-game-gold">
                Create one
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
