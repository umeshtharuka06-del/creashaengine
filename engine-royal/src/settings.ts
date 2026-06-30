import { prisma } from "./db";

/**
 * Platform settings (EXACT copy of the website's src/lib/settings.ts).
 * The website's admin panel writes these; the engine reads them so round
 * timing and the prediction win-rate stay in sync across both services.
 */
export const DEFAULT_SETTINGS: Record<string, string> = {
  signup_bonus_coins: process.env.SIGNUP_BONUS_COINS || "1000",
  color_round_seconds: "180",
  color_lock_seconds: "5",
  number_round_seconds: "180",
  number_lock_seconds: "5",
  // Integrated prediction game modes (see website settings.ts for docs).
  // All four modes run on a 3-minute (180s) round schedule.
  parity_round_seconds: "180",
  sapre_round_seconds: "180",
  bcone_round_seconds: "180",
  emerd_round_seconds: "180",
  prediction_lock_seconds: "5",
  crash_betting_seconds: "8",
  crash_house_edge_pct: "1",
  crash_auto_cashout_enabled: "true",
  house_fee_enabled: "true",
  house_fee_type: "percentage",
  house_fee_value: "2",
  // Crypto settings (used by the website; mirrored here for parity).
  crypto_enabled: "true",
  crypto_deposit_wallet: "",
  crypto_usdt_contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  crypto_min_deposit_usdt: "10",
  crypto_min_withdraw_coins: "1000",
  crypto_withdraw_fee_usdt: "1",
  crypto_coins_per_usdt: "100",
  crypto_confirmations: "20",
  crypto_poll_seconds: "30",
  prediction_heavy_win_rate: "0.4",
  // Single-player colour fairness (engine-only; see prediction-engine.ts).
  // Applied ONLY when a colour round has exactly one distinct player.
  single_player_color_win_rate: "0.4", // target colour win-rate for the lone player
  single_player_color_max_payout: "0", // coin-cents affordability cap (0 = no cap)
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULT_SETTINGS[key] ?? "";
}

export async function getSettingNumber(key: string): Promise<number> {
  return Number(await getSetting(key));
}
