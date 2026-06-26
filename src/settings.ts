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
  prediction_heavy_win_rate: "0.4",
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULT_SETTINGS[key] ?? "";
}

export async function getSettingNumber(key: string): Promise<number> {
  return Number(await getSetting(key));
}
