import { db, scannersTable, alertsTable, scanLogsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
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
    // Write error log
    await db.insert(scanLogsTable).values({
      scannerId,
      stocksFound: 0,
      newAlerts: 0,
      symbols: [],
      error: result.error,
    });
    await db
      .update(scannersTable)
      .set({ lastScannedAt: new Date() })
      .where(eq(scannersTable.id, scannerId));
    return { stocksFound: 0, newAlerts: 0, scannerName: scanner.name };
  }

  const stocks = result.stocks;

  await db
    .update(scannersTable)
    .set({ lastScannedAt: new Date() })
    .where(eq(scannersTable.id, scannerId));

  const symbols = stocks.map((s) => s.nsecode).filter(Boolean);
  const prices: Record<string, number | null> = {};
  for (const s of stocks) {
    prices[s.nsecode] = s.close ?? null;
  }

  if (symbols.length === 0) {
    // Write empty scan log
    await db.insert(scanLogsTable).values({
      scannerId,
      stocksFound: 0,
      newAlerts: 0,
      symbols: [],
      error: null,
    });
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

  let newAlerts = 0;
  let telegramSent = false;

  if (newSymbols.length > 0) {
    telegramSent = await sendTelegramAlert(scanner.name, newSymbols, prices);

    const rows = newSymbols.map((sym) => ({
      scannerId,
      symbol: sym,
      price: prices[sym] ?? null,
      telegramSent,
    }));

    await db.insert(alertsTable).values(rows);
    newAlerts = newSymbols.length;
    logger.info({ scannerId, newAlerts, telegramSent }, "Scan complete");
  } else {
    logger.info({ scannerId, total: symbols.length }, "All symbols already alerted today");
  }

  // Write scan log with ALL found symbols (not just new ones)
  await db.insert(scanLogsTable).values({
    scannerId,
    stocksFound: stocks.length,
    newAlerts,
    symbols,
    error: null,
  });

  return { stocksFound: stocks.length, newAlerts, scannerName: scanner.name };
}

async function scheduleScanner(
  scannerId: number,
  intervalMinutes: number,
  initialDelayMs = 0,
): Promise<void> {
  const existing = timers.get(scannerId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  // First run fires after the interval PLUS any stagger offset
  const firstDelay = intervalMs + initialDelayMs;

  const run = async () => {
    try {
      await runScanForScanner(scannerId);
    } catch (err) {
      logger.error({ err, scannerId }, "Scan failed");
    }
    const t = timers.get(scannerId);
    if (t) {
      t.timer = setTimeout(run, t.intervalMs);
      t.nextRunAt = Date.now() + t.intervalMs;
    }
  };

  timers.set(scannerId, {
    scannerId,
    intervalMs,
    nextRunAt: Date.now() + firstDelay,
    timer: setTimeout(run, firstDelay),
  });

  logger.info({ scannerId, intervalMinutes, initialDelayMs }, "Scanner scheduled");
}

export function unscheduleScanner(scannerId: number): void {
  const t = timers.get(scannerId);
  if (t?.timer) {
    clearTimeout(t.timer);
  }
  timers.delete(scannerId);
}

/** Seconds to wait between starting each scanner on boot to avoid burst requests */
const BOOT_STAGGER_MS = 15_000;

export async function startPoller(): Promise<void> {
  logger.info("Starting Chartink poller");

  const scanners = await db
    .select()
    .from(scannersTable)
    .where(eq(scannersTable.isActive, true));

  for (let i = 0; i < scanners.length; i++) {
    const scanner = scanners[i]!;
    // Stagger first run: scanner 0 fires at interval, scanner 1 at interval+15s, etc.
    await scheduleScanner(scanner.id, scanner.intervalMinutes, i * BOOT_STAGGER_MS);
  }

  logger.info({ count: scanners.length }, "Poller started with active scanners");
}

export { scheduleScanner };
