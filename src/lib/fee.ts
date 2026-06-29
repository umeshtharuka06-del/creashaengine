import { getSetting, getSettingNumber } from "./settings";

/**
 * House fee on a bet stake. Single source of truth for fee math.
 *
 *   betAmount   – the gross stake the user is debited (coin-cents)
 *   feeAmount   – the house fee taken from it
 *   effectiveBet – betAmount - feeAmount; settlement pays out on THIS, not the gross
 *
 * Configurable from admin → Config:
 *   house_fee_enabled = "true" | "false"
 *   house_fee_type    = "percentage" | "flat"
 *   house_fee_value   = e.g. "2"  (2% when percentage, 2 coins when flat)
 */
export interface FeeBreakdown {
  betAmount: number;
  feeAmount: number;
  effectiveBet: number;
}

export async function computeFee(amountCents: number): Promise<FeeBreakdown> {
  const enabled = (await getSetting("house_fee_enabled")) !== "false";
  if (!enabled) {
    return { betAmount: amountCents, feeAmount: 0, effectiveBet: amountCents };
  }

  const type = (await getSetting("house_fee_type")) || "percentage";
  const value = (await getSettingNumber("house_fee_value")) || 0;

  let fee =
    type === "flat"
      ? Math.round(value * 100) // flat value is in whole coins → cents
      : Math.floor((amountCents * value) / 100); // percentage of the stake

  // Never let the fee meet or exceed the stake (the bet must keep some value).
  fee = Math.max(0, Math.min(fee, amountCents - 1));

  return { betAmount: amountCents, feeAmount: fee, effectiveBet: amountCents - fee };
}
