import { logger } from "./logger";

export let TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
export let TELEGRAM_CHAT_ID = process.env["TELEGRAM_CHAT_ID"];

export function setTelegramConfig(botToken: string, chatId: string): void {
  TELEGRAM_BOT_TOKEN = botToken;
  TELEGRAM_CHAT_ID = chatId;
}

export function isTelegramEnabled(): boolean {
  return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

export function getTelegramConfig() {
  return {
    hasBotToken: !!TELEGRAM_BOT_TOKEN,
    hasChatId: !!TELEGRAM_CHAT_ID,
    botTokenLast4: TELEGRAM_BOT_TOKEN ? TELEGRAM_BOT_TOKEN.slice(-4) : null,
    chatIdMasked: TELEGRAM_CHAT_ID ? maskChatId(TELEGRAM_CHAT_ID) : null,
    enabled: isTelegramEnabled(),
  };
}

export async function sendTelegramAlert(
  scannerName: string,
  symbols: string[],
  prices: Record<string, number | null>
): Promise<boolean> {
  if (!isTelegramEnabled()) {
    logger.warn("Telegram not configured, skipping alert");
    return false;
  }

  if (symbols.length === 0) return false;

  const lines = symbols.map((sym) => {
    const price = prices[sym];
    return price != null ? `• ${sym} @ ₹${price.toFixed(2)}` : `• ${sym}`;
  });

  const message =
    `🔔 *${escapeMarkdown(scannerName)}*\n` +
    `${symbols.length} stock${symbols.length !== 1 ? "s" : ""} matched:\n` +
    lines.map((l) => escapeMarkdown(l)).join("\n") +
    `\n\n_${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST_`;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "MarkdownV2",
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      logger.error({ status: resp.status, body }, "Telegram API error");
      return false;
    }

    logger.info({ scannerName, count: symbols.length }, "Telegram alert sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram alert");
    return false;
  }
}

export async function sendTelegramTestNotification(): Promise<{ success: boolean; message: string }> {
  if (!isTelegramEnabled()) {
    return { success: false, message: "Telegram is not configured" };
  }

  const ok = await sendTelegramAlert("Telegram Test", ["TEST_SIGNAL"], { TEST_SIGNAL: null });
  return ok
    ? { success: true, message: "Test notification sent" }
    : { success: false, message: "Failed to send test notification" };
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return chatId;
  return `${chatId.slice(0, 2)}***${chatId.slice(-2)}`;
}
