import { getAllSettings } from "./settings";
import { enqueue } from "./queue";

// ────────────────────────────────────────────────────────────────────────────
// Telegram notifications.
//
// Admin configures a bot token + chat id (Admin → Telegram). Every notifier is
// fire-and-forget and fully guarded: a Telegram outage or a misconfigured token
// must NEVER break the user/admin request it is attached to. All errors are
// swallowed (optionally surfaced to the server log).
// ────────────────────────────────────────────────────────────────────────────

interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  largeDepositUsdt: number;
  largeWithdrawUsdt: number;
}

async function getTelegramConfig(): Promise<TelegramConfig> {
  const s = await getAllSettings();
  const num = (k: string, d: number) => {
    const n = Number(s[k]);
    return Number.isFinite(n) ? n : d;
  };
  return {
    enabled: s.telegram_enabled === "true",
    botToken: (s.telegram_bot_token || "").trim(),
    chatId: (s.telegram_chat_id || "").trim(),
    largeDepositUsdt: num("telegram_large_deposit_usdt", 1000),
    largeWithdrawUsdt: num("telegram_large_withdraw_usdt", 1000),
  };
}

/**
 * Enqueue a notification for the dedicated telegram-worker process so the
 * outbound HTTP call never runs inside a Next.js request. Falls back to inline
 * delivery when the queue is disabled (local dev / no Redis) — identical
 * behaviour to the pre-migration code path. Returns true when queued/sent.
 */
export async function sendTelegram(text: string): Promise<boolean> {
  if (await enqueue("telegram", { text })) return true;
  return deliverTelegram(text);
}

/**
 * Perform the actual outbound Telegram send. Used inline as the no-queue
 * fallback and by the telegram-worker draining the queue. Honours the enable
 * flag + config. (This is the original body of `sendTelegram`, unchanged.)
 */
export async function deliverTelegram(text: string): Promise<boolean> {
  const cfg = await getTelegramConfig();
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return false;
  return rawSend(cfg.botToken, cfg.chatId, text);
}

/** Send with explicit credentials (used by the "Test notification" button before
 *  the operator has saved the settings). */
export async function sendTelegramWith(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken || !chatId) return { ok: false, error: "Bot token and chat id are required." };
  try {
    const ok = await rawSend(botToken, chatId, text, true);
    return ok ? { ok: true } : { ok: false, error: "Telegram rejected the message." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}

async function rawSend(
  botToken: string,
  chatId: string,
  text: string,
  rethrow = false
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch (e) {
    if (rethrow) throw e;
    return false; // swallow — notifications must never break the request flow
  } finally {
    clearTimeout(timer);
  }
}

// ── Message formatting ──────────────────────────────────────────────────────

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function now(): string {
  // "YYYY-MM-DD HH:mm" in UTC.
  return new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/** Build a "Title\n\nKey: value" block in the spec's layout. */
function format(title: string, fields: Record<string, string | number | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`);
  return `<b>${esc(title)}</b>\n\n${lines.join("\n")}`;
}

// ── Event notifiers (each guarded; safe to call without await-handling) ──────

export async function notifyNewUser(p: { username: string; uid: string }) {
  await sendTelegram(
    format("🆕 New User Registration", {
      User: p.username,
      UID: p.uid,
      Time: now(),
    })
  );
}

export async function notifyDepositRequest(p: {
  username: string;
  uid: string;
  amountUsdt: number;
  coins: string;
  wallet: string;
}) {
  const cfg = await getTelegramConfig();
  const large = p.amountUsdt >= cfg.largeDepositUsdt;
  await sendTelegram(
    format(large ? "💰 New Deposit (LARGE)" : "💰 New Deposit Request", {
      User: p.username,
      UID: p.uid,
      Amount: `${p.amountUsdt} USDT (${p.coins} coins)`,
      Wallet: p.wallet,
      Time: now(),
      Status: "Pending",
    })
  );
}

export async function notifyDepositApproved(p: {
  username: string;
  uid: string;
  coins: string;
  wallet: string;
  via: "auto" | "admin";
}) {
  await sendTelegram(
    format("✅ Deposit Approved", {
      User: p.username,
      UID: p.uid,
      Amount: `${p.coins} coins`,
      Wallet: p.wallet,
      Via: p.via === "auto" ? "Auto-detected" : "Admin",
      Time: now(),
      Status: "Approved",
    })
  );
}

export async function notifyWithdrawRequest(p: {
  username: string;
  uid: string;
  coins: string;
  usdt: number;
  address: string;
}) {
  const cfg = await getTelegramConfig();
  const large = p.usdt >= cfg.largeWithdrawUsdt;
  await sendTelegram(
    format(large ? "🏧 Withdraw Request (LARGE)" : "🏧 Withdraw Request", {
      User: p.username,
      UID: p.uid,
      Amount: `${p.coins} coins (${p.usdt.toFixed(2)} USDT)`,
      Destination: p.address,
      Time: now(),
      Status: "Pending",
    })
  );
}

export async function notifyWithdrawResolved(p: {
  username: string;
  uid: string;
  coins: string;
  address: string;
  status: "Approved" | "Completed" | "Rejected";
}) {
  const icon = p.status === "Rejected" ? "❌" : "✅";
  await sendTelegram(
    format(`${icon} Withdraw ${p.status}`, {
      User: p.username,
      UID: p.uid,
      Amount: `${p.coins} coins`,
      Destination: p.address,
      Time: now(),
      Status: p.status,
    })
  );
}

export async function notifyAdminLogin(p: { username: string; uid: string; ip?: string }) {
  await sendTelegram(
    format("🔐 Admin Login", {
      User: p.username,
      UID: p.uid,
      IP: p.ip,
      Time: now(),
    })
  );
}
