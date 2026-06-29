"use client";

import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import {
  RocketIcon,
  ShieldIcon,
  BoltIcon,
  ChartIcon,
  TrophyIcon,
  WalletIcon,
  MODE_ICON,
} from "./icons";

const MODES = [
  { key: "PARITY", label: "Parity", color: "#28c76f" },
  { key: "SAPRE", label: "Sapre", color: "#2f6df6" },
  { key: "BCONE", label: "Bcone", color: "#9b4dff" },
  { key: "EMERD", label: "Emerd", color: "#f6c343" },
] as const;

const FEATURES = [
  { icon: BoltIcon, title: "Instant rounds", body: "New colour & number rounds every 3 minutes — never wait to play." },
  { icon: WalletIcon, title: "Fast payouts", body: "Wins are credited the moment a round settles, straight to your wallet." },
  { icon: ShieldIcon, title: "Secure & private", body: "Encrypted sessions and protected accounts keep your balance safe." },
  { icon: ChartIcon, title: "Live results", body: "Watch the last 10 results update in real time across every game." },
];

const STATS = [
  { value: "5", label: "Live games" },
  { value: "3 min", label: "Round time" },
  { value: "9×", label: "Max payout" },
  { value: "24/7", label: "Always on" },
];

const STEPS = [
  { n: 1, title: "Create an account", body: "Register in seconds and claim your welcome coins." },
  { n: 2, title: "Pick a game", body: "Choose Parity, Sapre, Bcone, Emerd or Crash." },
  { n: 3, title: "Predict & win", body: "Back a colour or number, then watch the result land." },
];

const FAQ = [
  { q: "What is Mega 99?", a: "Mega 99 is a premium colour-prediction gaming platform with five live games and instant rounds." },
  { q: "How fast are payouts?", a: "Winning bets are credited to your wallet automatically the instant a round settles." },
  { q: "What is the minimum bet?", a: "You can play from just 50 coins on every game." },
  { q: "Can I play on mobile?", a: "Yes — Mega 99 is mobile-first and installable as an app on your phone." },
];

export function Landing() {
  return (
    <div className="w-full">
      {/* HERO */}
      <section className="relative overflow-hidden px-4 pb-14 pt-6">
        <div className="pointer-events-none absolute left-1/2 top-[-120px] h-[360px] w-[360px] -translate-x-1/2 rounded-full bg-mega-gold/20 blur-[90px]" />
        <div className="pointer-events-none absolute right-[-80px] top-40 h-64 w-64 rounded-full bg-game-violet/20 blur-[90px]" />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
          <BrandLogo size={148} priority />
          <h1 className="mt-5 font-display text-3xl font-extrabold leading-tight sm:text-5xl">
            Predict. Play. <span className="brand-gradient">Win Big.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
            The premium colour-prediction casino. Five live games, instant 3-minute
            rounds and fast payouts — all in one sleek app.
          </p>
          <div className="mt-6 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/register" className="btn-gold flex-1 !py-4 text-base">
              <RocketIcon className="h-5 w-5" /> Play Now
            </Link>
            <Link href="/register" className="btn-ghost flex-1 !py-4 text-base">
              Register
            </Link>
            <Link href="/login" className="btn-ghost flex-1 !py-4 text-base sm:flex-none sm:px-6">
              Login
            </Link>
          </div>
        </div>
      </section>

      {/* GAME PREVIEW */}
      <Section title="Five ways to win" subtitle="Game preview">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MODES.map((m) => {
            const Icon = MODE_ICON[m.key];
            return (
              <div key={m.key} className="card flex flex-col items-center gap-2 p-5 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl text-white" style={{ background: m.color }}>
                  <Icon className="h-7 w-7" />
                </span>
                <div className="text-sm font-bold">{m.label}</div>
                <div className="text-[11px] text-slate-400">3 min rounds</div>
              </div>
            );
          })}
          <div className="card flex flex-col items-center gap-2 p-5 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-game-red text-white">
              <RocketIcon className="h-7 w-7" />
            </span>
            <div className="text-sm font-bold">Crash</div>
            <div className="text-[11px] text-slate-400">Cash out early</div>
          </div>
        </div>
      </Section>

      {/* FEATURES */}
      <Section title="Built for players" subtitle="Features">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-mega-gold/15 text-game-gold">
                <f.icon className="h-6 w-6" />
              </span>
              <div className="mt-3 text-base font-bold">{f.title}</div>
              <p className="mt-1 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* STATISTICS */}
      <Section title="Trusted by players" subtitle="By the numbers">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="card p-5 text-center">
              <div className="font-display text-3xl font-extrabold text-game-gold">{s.value}</div>
              <div className="mt-1 text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section title="How it works" subtitle="Get started">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-5">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-mega-gold/15 font-display text-lg font-extrabold text-game-gold">
                {s.n}
              </span>
              <div className="mt-3 text-base font-bold">{s.title}</div>
              <p className="mt-1 text-sm text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* SECURITY */}
      <Section title="Your security comes first" subtitle="Security">
        <div className="mx-auto max-w-4xl">
          <div className="card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-mega-gold/15 text-game-gold">
              <ShieldIcon className="h-9 w-9" />
            </span>
            <div>
              <div className="text-lg font-bold">Encrypted & protected</div>
              <p className="mt-1 text-sm text-slate-400">
                Every session is encrypted, balances are stored as an immutable ledger,
                and accounts are guarded against unauthorised access — so you can focus
                on the game.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section title="Frequently asked" subtitle="FAQ">
        <div className="mx-auto max-w-3xl space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="card group p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
                {f.q}
                <span className="text-game-gold transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* CTA + FOOTER */}
      <section className="px-4 pb-28 pt-4">
        <div className="mx-auto max-w-4xl">
          <div className="card relative overflow-hidden border border-mega-gold/25 p-8 text-center">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-mega-gold/10 to-transparent" />
            <div className="relative">
              <TrophyIcon className="mx-auto h-10 w-10 text-game-gold" />
              <h3 className="mt-3 font-display text-2xl font-extrabold">Ready to play?</h3>
              <p className="mt-1 text-sm text-slate-300">Join Mega 99 and start predicting today.</p>
              <Link href="/register" className="btn-gold mx-auto mt-5 inline-flex !px-8 !py-4 text-base">
                Create free account
              </Link>
            </div>
          </div>

          <footer className="mt-8 flex flex-col items-center gap-2 border-t border-white/5 pt-6 text-center">
            <BrandLogo size={40} />
            <div className="font-display text-sm font-extrabold">MEGA 99</div>
            <p className="max-w-md text-xs text-slate-500">
              Mega 99 — premium colour prediction gaming. Play responsibly. Virtual
              coins only.
            </p>
            <div className="mt-1 text-[11px] text-slate-600">
              © {new Date().getFullYear()} Mega 99. All rights reserved.
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-8">
      <div className="mx-auto mb-5 max-w-5xl text-center">
        <div className="text-xs font-bold uppercase tracking-widest text-game-gold">{subtitle}</div>
        <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}
