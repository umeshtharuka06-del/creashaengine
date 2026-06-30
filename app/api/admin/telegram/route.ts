import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAllSettings, setSetting } from "@/lib/settings";
import { sendTelegramWith } from "@/lib/telegram";
import { ok, fail } from "@/lib/http";
import { audit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const KEYS = [
  "telegram_enabled",
  "telegram_bot_token",
  "telegram_chat_id",
  "telegram_large_deposit_usdt",
  "telegram_large_withdraw_usdt",
] as const;

// Current Telegram settings (the bot token is returned so the admin can edit it;
// the panel is already admin-only).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);
  const s = await getAllSettings();
  return ok(Object.fromEntries(KEYS.map((k) => [k, s[k] ?? ""])));
}

const saveSchema = z.object({
  action: z.literal("save"),
  settings: z.object({
    telegram_enabled: z.enum(["true", "false"]).optional(),
    telegram_bot_token: z.string().max(120).optional(),
    telegram_chat_id: z.string().max(60).optional(),
    telegram_large_deposit_usdt: z.string().max(20).optional(),
    telegram_large_withdraw_usdt: z.string().max(20).optional(),
  }),
});

const testSchema = z.object({
  action: z.literal("test"),
  botToken: z.string().max(120).optional(),
  chatId: z.string().max(60).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return fail("Forbidden.", 403);

  const body = await req.json().catch(() => ({}));

  // ── Save ──
  const save = saveSchema.safeParse(body);
  if (save.success) {
    for (const [k, v] of Object.entries(save.data.settings)) {
      if (v !== undefined) await setSetting(k, v.trim());
    }
    await audit("admin.telegram.save", { userId: admin.id });
    const s = await getAllSettings();
    return ok(Object.fromEntries(KEYS.map((k) => [k, s[k] ?? ""])));
  }

  // ── Test (uses provided creds, else the saved ones; bypasses the enable flag) ──
  const test = testSchema.safeParse(body);
  if (test.success) {
    const s = await getAllSettings();
    const botToken = (test.data.botToken || s.telegram_bot_token || "").trim();
    const chatId = (test.data.chatId || s.telegram_chat_id || "").trim();
    const res = await sendTelegramWith(
      botToken,
      chatId,
      "<b>✅ Royal 1</b>\n\nTest notification — your Telegram bot is connected."
    );
    await audit("admin.telegram.test", { userId: admin.id, detail: { ok: res.ok } });
    return res.ok ? ok({ sent: true }) : fail(res.error || "Telegram test failed.", 502);
  }

  return fail("Invalid request.");
}
