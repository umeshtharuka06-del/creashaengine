"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { useUser } from "@/lib/user-context";
import { CoinIcon } from "@/components/CoinIcon";
import { WithdrawIcon } from "@/components/icons";
import { AmountInput } from "@/components/AmountInput";

interface Config {
  network: string;
  minWithdrawCoins: number;
  withdrawFeeUsdt: number;
  coinsPerUsdt: number;
}
interface Withdrawal {
  id: string;
  address: string;
  coinsFmt: string;
  usdt: number;
  feeUsdt: number;
  receiveUsdt: number;
  status: string;
  txid: string | null;
  createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-royal-blue/15 text-royal-blue-bright",
  APPROVED: "bg-mega-gold/15 text-game-gold",
  COMPLETED: "bg-game-green/15 text-game-green",
  REJECTED: "bg-game-red/15 text-game-red-bright",
};

export default function WithdrawPage() {
  const { me, loading, refresh } = useUser();
  const router = useRouter();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [address, setAddress] = useState("");
  const [coins, setCoins] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login?next=/withdraw");
  }, [loading, me, router]);

  const loadCfg = useCallback(async () => {
    const r = await api<Config>("/api/crypto/config");
    if (r.ok && r.data) setCfg(r.data);
  }, []);
  const loadRows = useCallback(async () => {
    const r = await api<Withdrawal[]>("/api/crypto/withdrawals");
    if (r.ok && r.data) setRows(r.data);
  }, []);

  useEffect(() => {
    if (!me) return;
    loadCfg();
    loadRows();
    const t = setInterval(loadRows, 15000);
    return () => clearInterval(t);
  }, [me, loadCfg, loadRows]);

  if (!me || !cfg) {
    return (
      <div className="space-y-3 py-2">
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  const balanceCoins = me.balance / 100; // wallet stores coin-cents
  const usdt = coins != null ? coins / cfg.coinsPerUsdt : 0;
  const receive = Math.max(0, +(usdt - cfg.withdrawFeeUsdt).toFixed(6));

  async function submit() {
    setMsg(null);
    if (coins === null || coins < cfg!.minWithdrawCoins)
      return setMsg({ text: `Minimum withdrawal is ${cfg!.minWithdrawCoins} coins.`, ok: false });
    if (coins > balanceCoins) return setMsg({ text: "Amount exceeds your balance.", ok: false });
    setBusy(true);
    const r = await api("/api/crypto/withdrawals", { json: { address, coins } });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error || "Request failed.", ok: false });
    setMsg({ text: "Withdrawal requested. An admin will process it shortly.", ok: true });
    setCoins(null);
    refresh();
    loadRows();
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-black">
          <WithdrawIcon className="h-5 w-5 text-game-gold" /> Withdraw USDT
        </h1>
        <Link href="/mine" className="text-xs font-semibold text-game-gold">
          ← Back
        </Link>
      </div>

      {/* Balance */}
      <div className="card p-4">
        <div className="text-xs uppercase tracking-wide text-slate-400">Current balance</div>
        <div className="mt-1 flex items-center gap-2 font-display text-2xl font-extrabold">
          <CoinIcon className="text-game-gold" size={24} /> {me.balanceFmt}
        </div>
        <div className="text-xs text-slate-400">≈ {(balanceCoins / cfg.coinsPerUsdt).toFixed(2)} USDT</div>
      </div>

      {/* Request form */}
      <div className="card space-y-3 p-4">
        <div>
          <label className="text-xs text-slate-400">TRC20 wallet address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="T..."
            className="input mt-1 text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Coins to withdraw</label>
          <AmountInput
            value={coins}
            onChange={setCoins}
            min={cfg.minWithdrawCoins}
            placeholder={`Min ${cfg.minWithdrawCoins} coins`}
            warning={`Minimum withdrawal is ${cfg.minWithdrawCoins} coins.`}
            className="mt-1"
          />
        </div>

        {/* Live conversion summary */}
        <div className="rounded-xl bg-[#0f1626] p-3 text-sm">
          <Row label="USDT equivalent" value={`${usdt.toFixed(2)} USDT`} />
          <Row label="Withdrawal fee" value={`${cfg.withdrawFeeUsdt.toFixed(2)} USDT`} />
          <div className="my-2 h-px bg-white/10" />
          <Row label="You will receive" value={`${receive.toFixed(2)} USDT`} strong />
          <Row label="Network" value={cfg.network} />
          <Row label="Minimum" value={`${cfg.minWithdrawCoins} coins`} />
        </div>

        <button onClick={submit} disabled={busy} className="btn-gold w-full">
          {busy ? "Requesting…" : "Request withdrawal"}
        </button>
        {msg && (
          <div className={`text-sm ${msg.ok ? "text-game-green" : "text-game-red-bright"}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* History */}
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-bold">Withdrawal history</h2>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">No withdrawals yet.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((w) => (
              <div key={w.id} className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <CoinIcon className="text-game-gold" /> {w.coinsFmt}
                    <span className="text-slate-400"> → {w.receiveUsdt.toFixed(2)} USDT</span>
                  </div>
                  <span className={`chip ${STATUS_STYLE[w.status] ?? "bg-white/5 text-slate-400"}`}>
                    {w.status.charAt(0) + w.status.slice(1).toLowerCase()}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                  <span>Fee {w.feeUsdt.toFixed(2)} USDT</span>
                  <span className="break-all">To {w.address.slice(0, 8)}…{w.address.slice(-6)}</span>
                  <span>{new Date(w.createdAt).toLocaleString()}</span>
                </div>
                {w.txid && (
                  <a
                    href={`https://tronscan.org/#/transaction/${w.txid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-all font-mono text-[11px] text-royal-blue-bright"
                  >
                    TXID: {w.txid.slice(0, 14)}…
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-slate-400">{label}</span>
      <span className={strong ? "font-bold text-game-gold" : "text-slate-200"}>{value}</span>
    </div>
  );
}
