import { logger } from "./logger";

export let TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"];
export let TELEGRAM_CHAT_ID = process.env["TELEGRAM_CHAT_ID"];

const TELEGRAM_MAX_CHARS = 4000; // Telegram limit is 4096; leave headroom for header/footer

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

async function sendRawMessage(text: string): Promise<boolean> {
  if (!isTelegramEnabled()) return false;
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "MarkdownV2",
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      logger.error({ status: resp.status, body }, "Telegram API error");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram message");
    return false;
  }
}

export async function sendTelegramAlert(
  scannerName: string,
  symbols: string[],
  prices: Record<string, number | null>,
): Promise<boolean> {
  if (!isTelegramEnabled()) {
    logger.warn("Telegram not configured, skipping alert");
    return false;
  }

  if (symbols.length === 0) return false;

  const escapedName = escapeMarkdown(scannerName);
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const escapedTimestamp = escapeMarkdown(timestamp);

  const lines = symbols.map((sym) => {
    const price = prices[sym];
    return price != null
      ? `• ${escapeMarkdown(sym)} @ ₹${escapeMarkdown(price.toFixed(2))}`
      : `• ${escapeMarkdown(sym)}`;
  });

  // Split into chunks that fit within Telegram's message size limit
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;

  const header = `🔔 *${escapedName}*\n${symbols.length} stock${symbols.length !== 1 ? "s" : ""} matched:\n`;
  const footer = `\n_${escapedTimestamp} IST_`;
  const overhead = header.length + footer.length + 10; // buffer

  for (const line of lines) {
    if (currentLen + line.length + 1 + overhead > TELEGRAM_MAX_CHARS && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += line.length + 1;
  }
  if (current.length > 0) chunks.push(current);

  let allOk = true;
  for (let i = 0; i < chunks.length; i++) {
    const chunkLines = chunks[i]!;
    const part = chunks.length > 1 ? ` \\(${i + 1}/${chunks.length}\\)` : "";
    const message =
      `🔔 *${escapedName}*${part}\n` +
      `${chunkLines.length} stock${chunkLines.length !== 1 ? "s" : ""} matched:\n` +
      chunkLines.join("\n") +
      (i === chunks.length - 1 ? `\n\n_${escapedTimestamp} IST_` : "");

    const ok = await sendRawMessage(message);
    if (!ok) allOk = false;

    // Small delay between chunks to avoid hitting Telegram rate limits
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  logger.info({ scannerName, count: symbols.length, chunks: chunks.length }, "Telegram alert sent");
  return allOk;
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
