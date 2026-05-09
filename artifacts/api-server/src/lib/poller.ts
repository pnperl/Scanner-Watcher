import { db, scannersTable, alertsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { runChartinkScan } from "./chartink";
import { sendTelegramAlert } from "./telegram";
import { logger } from "./logger";

interface ScannerTimer {
  scannerId: number;
  intervalMs: number;
  nextRunAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const timers = new Map<number, ScannerTimer>();
let masterInterval: ReturnType<typeof setInterval> | null = null;

export async function runScanForScanner(scannerId: number): Promise<{
  stocksFound: number;
  newAlerts: number;
  scannerName: string;
}> {
  const [scanner] = await db
    .select()
    .from(scannersTable)
    .where(eq(scannersTable.id, scannerId));

  if (!scanner) {
    throw new Error(`Scanner ${scannerId} not found`);
  }

  logger.info({ scannerId, name: scanner.name }, "Running scan");

  const result = await runChartinkScan(scanner.chartinkUrl);

  if (result.error) {
    logger.warn({ scannerId, error: result.error }, "Scan error");
  }

  const stocks = result.stocks;

  await db
    .update(scannersTable)
    .set({ lastScannedAt: new Date() })
    .where(eq(scannersTable.id, scannerId));

  if (stocks.length === 0) {
    return { stocksFound: 0, newAlerts: 0, scannerName: scanner.name };
  }

  const symbols = stocks.map((s) => s.nsecode).filter(Boolean);
  const prices: Record<string, number | null> = {};
  for (const s of stocks) {
    prices[s.nsecode] = s.close ?? null;
  }

  if (symbols.length === 0) {
    return { stocksFound: stocks.length, newAlerts: 0, scannerName: scanner.name };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingToday = await db
    .select({ symbol: alertsTable.symbol })
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.scannerId, scannerId),
        sql`${alertsTable.triggeredAt} >= ${today.toISOString()}`
      )
    );

  const alreadySentToday = new Set(existingToday.map((a) => a.symbol));
  const newSymbols = symbols.filter((s) => !alreadySentToday.has(s));

  if (newSymbols.length === 0) {
    logger.info({ scannerId, total: symbols.length }, "All symbols already alerted today");
    return { stocksFound: stocks.length, newAlerts: 0, scannerName: scanner.name };
  }

  const telegramSent = await sendTelegramAlert(scanner.name, newSymbols, prices);

  const rows = newSymbols.map((sym) => ({
    scannerId,
    symbol: sym,
    price: prices[sym] ?? null,
    telegramSent,
  }));

  await db.insert(alertsTable).values(rows);

  logger.info({ scannerId, newAlerts: newSymbols.length, telegramSent }, "Scan complete");

  return { stocksFound: stocks.length, newAlerts: newSymbols.length, scannerName: scanner.name };
}

async function scheduleScanner(scannerId: number, intervalMinutes: number): Promise<void> {
  const existing = timers.get(scannerId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  const run = async () => {
    try {
      await runScanForScanner(scannerId);
    } catch (err) {
      logger.error({ err, scannerId }, "Scan failed");
    }
    const t = timers.get(scannerId);
    if (t) {
      t.timer = setTimeout(run, t.intervalMs);
    }
  };

  timers.set(scannerId, {
    scannerId,
    intervalMs,
    nextRunAt: Date.now() + intervalMs,
    timer: setTimeout(run, intervalMs),
  });

  logger.info({ scannerId, intervalMinutes }, "Scanner scheduled");
}

export function unscheduleScanner(scannerId: number): void {
  const t = timers.get(scannerId);
  if (t?.timer) {
    clearTimeout(t.timer);
  }
  timers.delete(scannerId);
}

export async function startPoller(): Promise<void> {
  logger.info("Starting Chartink poller");

  const scanners = await db
    .select()
    .from(scannersTable)
    .where(eq(scannersTable.isActive, true));

  for (const scanner of scanners) {
    await scheduleScanner(scanner.id, scanner.intervalMinutes);
  }

  logger.info({ count: scanners.length }, "Poller started with active scanners");
}

export { scheduleScanner };
