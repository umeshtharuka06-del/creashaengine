import { prisma } from "./db";

/** Default platform settings, overridable from the admin panel. */
export const DEFAULT_SETTINGS: Record<string, string> = {
  // Integrated prediction game — one round stream per mode. Each carries both
  // colour and number bets. Betting closes `prediction_lock_seconds` before end.
  // All four modes run on a 3-minute (180s) round schedule.
  parity_round_seconds: "180",
  sapre_round_seconds: "180",
  bcone_round_seconds: "180",
  emerd_round_seconds: "180",
  prediction_lock_seconds: "5",
  crash_betting_seconds: "8",
  crash_house_edge_pct: "1",
  // When "false", the manual/auto cashout multiplier UI is hidden and crash is
  // pure manual cash-out only.
  crash_auto_cashout_enabled: "true",
  // House fee taken on every bet's stake. effectiveBet = stake - fee, and
  // settlement pays out on effectiveBet. type = "percentage" | "flat".
  house_fee_enabled: "true",
  house_fee_type: "percentage",
  house_fee_value: "2", // 2% (percentage) OR 2 coins (flat)
  // ── Crypto (TRC20 USDT) deposits & withdrawals ──
  // Deposit wallets are managed as DepositWallet rows (Admin → Deposit Wallets),
  // not a single env/setting. The poller watches the wallets that have pending
  // requests and credits matched transfers when crypto_auto_credit is on.
  crypto_auto_credit: "true",
  crypto_usdt_contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", // official USDT TRC20 contract
  crypto_min_deposit_usdt: "10",
  crypto_min_withdraw_coins: "1000", // = 10 USDT at 100 coins/USDT
  crypto_withdraw_fee_usdt: "1",
  crypto_coins_per_usdt: "100",
  crypto_confirmations: "20",
  crypto_poll_seconds: "30",
  // ── Telegram notifications ──
  telegram_enabled: "false",
  telegram_bot_token: "",
  telegram_chat_id: "",
  telegram_large_deposit_usdt: "1000", // alert threshold (USDT)
  telegram_large_withdraw_usdt: "1000",
  // Prediction engine: how often the most-backed ("heavy") side still wins.
  // 0.4 = the heavy side wins ~4 rounds out of 10. The website only stores this
  // value; the engine service (engine-royal/) reads it when settling rounds.
  prediction_heavy_win_rate: "0.4",
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULT_SETTINGS[key] ?? "";
}

export async function getSettingNumber(key: string): Promise<number> {
  return Number(await getSetting(key));
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}
