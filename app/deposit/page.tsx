"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { api } from "@/lib/client";
import { useUser } from "@/lib/user-context";
import { CoinIcon } from "@/components/CoinIcon";
import { RechargeIcon } from "@/components/icons";
import { AmountInput } from "@/components/AmountInput";

interface Wallet {
  id: string;
  name: string;
  address: string;
  network: string;
}
interface Config {
  network: string;
  wallet: Wallet | null;
  minDepositUsdt: number;
  coinsPerUsdt: number;
  confirmations: number;
}
interface Deposit {
  id: string;
  toAddress: string;
  network: string;
  amountUsdt: number;
  coinsFmt: string;
  txid: string | null;
  confirmations: number;
  status: string;
  createdAt: string;
}

// PENDING is shown as "Pending verification"; APPROVED → "Completed".
const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending verification", cls: "bg-royal-blue/15 text-royal-blue-bright" },
  APPROVED: { label: "Completed", cls: "bg-game-green/15 text-game-green" },
  REJECTED: { label: "Rejected", cls: "bg-game-red/15 text-game-red-bright" },
};

export default function DepositPage() {
  const { me, loading, refresh } = useUser();
  const router = useRouter();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [qr, setQr] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [txid, setTxid] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login?next=/deposit");
  }, [loading, me, router]);

  const loadCfg = useCallback(async () => {
    const r = await api<Config>("/api/crypto/config");
    if (r.ok && r.data) {
      setCfg(r.data);
      if (r.data.wallet?.address) {
        QRCode.toDataURL(r.data.wallet.address, { margin: 1, width: 220 })
          .then(setQr)
          .catch(() => setQr(""));
      }
    }
  }, []);

  const loadDeposits = useCallback(async () => {
    const r = await api<Deposit[]>("/api/crypto/deposits");
    if (r.ok && r.data) setDeposits(r.data);
  }, []);

  useEffect(() => {
    if (!me) return;
    loadCfg();
    loadDeposits();
    const t = setInterval(loadDeposits, 15000);
    return () => clearInterval(t);
  }, [me, loadCfg, loadDeposits]);

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const hasPending = deposits.some((d) => d.status === "PENDING");

  async function submit() {
    setMsg(null);
    if (!cfg?.wallet) return;
    if (amount === null || amount < cfg.minDepositUsdt)
      return setMsg({ text: `Minimum deposit is ${cfg.minDepositUsdt} USDT.`, ok: false });
    setBusy(true);
    const r = await api("/api/crypto/deposits", {
      json: { amountUsdt: amount, txid: txid.trim() || undefined },
    });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error || "Could not submit.", ok: false });
    setAmount(null);
    setTxid("");
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3500);
    refresh();
    loadDeposits();
  }

  if (!me || !cfg) {
    return (
      <div className="space-y-3 py-2">
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  const estMins = Math.max(1, Math.ceil((cfg.confirmations * 3) / 60));

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-black">
          <RechargeIcon className="h-5 w-5 text-game-gold" /> Deposit USDT
        </h1>
        <Link href="/mine" className="text-xs font-semibold text-game-gold">
          ← Back
        </Link>
      </div>

      {success && (
        <div className="card flex items-center gap-3 border-game-green/40 bg-game-green/10 p-4">
          <span className="success-check grid h-10 w-10 shrink-0 place-items-center rounded-full bg-game-green text-white">
            ✓
          </span>
          <div>
            <div className="text-sm font-bold text-game-green">Payment submitted!</div>
            <div className="text-xs text-slate-300">
              We&apos;re verifying your deposit. Coins are credited once confirmed.
            </div>
          </div>
        </div>
      )}

      {!cfg.wallet ? (
        <div className="card p-5 text-sm text-slate-400">
          Deposits are temporarily unavailable. Please check back shortly.
        </div>
      ) : (
        <>
          {/* Assigned wallet + QR */}
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="chip bg-royal-blue/15 text-royal-blue-bright">
                {cfg.wallet.name}
              </span>
              <span className="chip bg-mega-gold/15 text-game-gold">
                Network · USDT {cfg.wallet.network}
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              {qr ? (
                <img src={qr} alt="Deposit QR" className="rounded-xl bg-white p-2" width={200} height={200} />
              ) : (
                <div className="skeleton h-[200px] w-[200px] rounded-xl" />
              )}
              <div className="mt-3 w-full">
                <div className="text-xs text-slate-400">Your assigned deposit address</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-[#0f1626] px-3 py-2 text-xs text-slate-200">
                    {cfg.wallet.address}
                  </code>
                  <button onClick={() => copy(cfg.wallet!.address)} className="btn-gold !px-4 !py-2 text-xs">
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  This address is reserved for you until your deposit completes.
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-1 text-xs text-slate-400">
              <li>• Send <b className="text-slate-200">USDT ({cfg.wallet.network})</b> only — other tokens/networks are lost.</li>
              <li>• Minimum deposit: <b className="text-slate-200">{cfg.minDepositUsdt} USDT</b> ({cfg.coinsPerUsdt} coins = 1 USDT).</li>
              <li>• Estimated confirmation: <b className="text-slate-200">≈ {estMins} min</b>.</li>
            </ul>
          </div>

          {/* Amount + confirm */}
          <div className="card space-y-3 p-4">
            <div className="text-sm font-bold">Confirm your payment</div>
            <div>
              <label className="text-xs text-slate-400">Amount sent (USDT)</label>
              <AmountInput
                value={amount}
                onChange={setAmount}
                min={cfg.minDepositUsdt}
                placeholder={`Min ${cfg.minDepositUsdt} USDT`}
                warning={`Minimum deposit is ${cfg.minDepositUsdt} USDT.`}
                className="mt-1"
              />
              {amount != null && amount > 0 && (
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                  You&apos;ll receive <CoinIcon className="text-game-gold" />{" "}
                  <b className="text-game-gold">{(amount * cfg.coinsPerUsdt).toLocaleString()}</b> coins
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400">Transaction ID (optional — speeds up verification)</label>
              <input
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                placeholder="On-chain TXID"
                className="input mt-1 font-mono text-xs"
              />
            </div>

            <button
              onClick={submit}
              disabled={busy || hasPending}
              className="btn-gold w-full"
            >
              {busy ? "Submitting…" : hasPending ? "Deposit pending verification…" : "I Have Paid"}
            </button>
            {hasPending && (
              <p className="text-center text-[11px] text-slate-500">
                You have a pending deposit. It must be verified before you can submit another.
              </p>
            )}
            {msg && (
              <div className={`text-sm ${msg.ok ? "text-game-green" : "text-game-red-bright"}`}>
                {msg.text}
              </div>
            )}
          </div>

          {/* History */}
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold">Deposit history</h2>
            {deposits.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No deposits yet.</div>
            ) : (
              <div className="divide-y divide-white/5">
                {deposits.map((d) => {
                  const st = STATUS[d.status] ?? { label: d.status, cls: "bg-white/5 text-slate-400" };
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-sm font-semibold">
                          {d.amountUsdt} USDT
                          {d.status === "APPROVED" && (
                            <span className="flex items-center gap-1 text-game-green">
                              · +<CoinIcon className="text-game-gold" /> {d.coinsFmt}
                            </span>
                          )}
                        </div>
                        {d.txid ? (
                          <a
                            href={`https://tronscan.org/#/transaction/${d.txid}`}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate font-mono text-[11px] text-slate-500 hover:text-slate-300"
                          >
                            {d.txid.slice(0, 10)}…{d.txid.slice(-8)}
                          </a>
                        ) : (
                          <div className="truncate font-mono text-[11px] text-slate-500">
                            to {d.toAddress.slice(0, 8)}…{d.toAddress.slice(-6)}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`chip ${st.cls}`}>{st.label}</span>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {new Date(d.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
