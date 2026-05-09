import { logger } from "./logger";

const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
const TELEGRAM_CHAT_ID = process.env["TELEGRAM_CHAT_ID"];

export function isTelegramEnabled(): boolean {
  return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
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

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
