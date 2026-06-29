import { getAllSettings } from "@/lib/settings";

// Typed view over the crypto-related platform settings + the money conversions.
// One source of truth: everything reads these helpers, so changing a setting in
// the admin panel changes deposit/withdrawal behaviour everywhere consistently.

export interface CryptoConfig {
  // When true, the poller auto-credits an on-chain transfer it matches to a
  // pending request once it reaches `confirmations`. When false, the admin must
  // approve every request manually.
  autoCredit: boolean;
  usdtContract: string;
  minDepositUsdt: number;
  minWithdrawCoins: number; // whole coins
  withdrawFeeUsdt: number;
  coinsPerUsdt: number;
  confirmations: number;
  pollSeconds: number;
}

export async function getCryptoConfig(): Promise<CryptoConfig> {
  const s = await getAllSettings();
  const num = (k: string, d: number) => {
    const n = Number(s[k]);
    return Number.isFinite(n) ? n : d;
  };
  return {
    autoCredit: s.crypto_auto_credit !== "false",
    usdtContract: (s.crypto_usdt_contract || "").trim(),
    minDepositUsdt: num("crypto_min_deposit_usdt", 10),
    minWithdrawCoins: num("crypto_min_withdraw_coins", 1000),
    withdrawFeeUsdt: num("crypto_withdraw_fee_usdt", 1),
    coinsPerUsdt: num("crypto_coins_per_usdt", 100),
    confirmations: num("crypto_confirmations", 20),
    pollSeconds: num("crypto_poll_seconds", 30),
  };
}

// Coins are stored as integer "coin-cents" (1 coin = 100 cents) in the wallet.
const CENTS = 100;

/** USDT (float) → coin-cents to credit, using the configured rate. */
export function usdtToCoinCents(usdt: number, coinsPerUsdt: number): number {
  return Math.round(usdt * coinsPerUsdt * CENTS);
}

/** coin-cents → USDT (float, 2dp meaningful at 100 coins/USDT). */
export function coinCentsToUsdt(coinCents: number, coinsPerUsdt: number): number {
  return coinCents / CENTS / coinsPerUsdt;
}

/** Whole coins → coin-cents. */
export function coinsToCents(coins: number): number {
  return Math.round(coins * CENTS);
}
