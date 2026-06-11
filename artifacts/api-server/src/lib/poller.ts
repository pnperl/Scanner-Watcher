import { db, scannersTable, alertsTable, scanLogsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { runChartinkScan } from "./chartink";
import { sendTelegramAlert } from "./telegram";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Indian market hours: 9:15 AM – 3:30 PM IST, Monday–Friday
// ---------------------------------------------------------------------------
export function isWithinMarketHours(): boolean {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);

  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const totalMins = hours * 60 + minutes;

  const marketOpen = 9 * 60 + 15;  // 9:15 AM
  const marketClose = 15 * 60 + 30; // 3:30 PM

  return totalMins >= marketOpen && totalMins <= marketClose;
}

export function getMarketStatus(): { open: boolean; reason?: string } {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);

  const day = ist.getUTCDay();
  if (day === 0) return { open: false, reason: "Weekend (Sunday)" };
  if (day === 6) return { open: false, reason: "Weekend (Saturday)" };

  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const totalMins = hours * 60 + minutes;

  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  if (totalMins < marketOpen) return { open: false, reason: "Pre-market (opens 9:15 AM IST)" };
  if (totalMins > marketClose) return { open: false, reason: "After-hours (closed at 3:30 PM IST)" };
  return { open: true };
}

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
  durationMs: number;
}> {
  const startTime = Date.now();

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
    const durationMs = Date.now() - startTime;
    logger.warn({ scannerId, error: result.error, durationMs }, "Scan error");
    await db.insert(scanLogsTable).values({
      scannerId,
      stocksFound: 0,
      newAlerts: 0,
      symbols: [],
      error: result.error,
      durationMs,
    });
    await db
      .update(scannersTable)
      .set({ lastScannedAt: new Date() })
      .where(eq(scannersTable.id, scannerId));
    return { stocksFound: 0, newAlerts: 0, scannerName: scanner.name, durationMs };
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

  // Auto-run 15-day breakout strategy after each scan
  if (symbols.length > 0) {
    try {
      const { runStrategy } = await import("./strategy-runner");
      runStrategy(scannerId, symbols, undefined, false, scanner.name)
        .then((result) => {
          logger.info({ scannerId, strategyRunId: result.runId, signalsFound: result.signalsFound }, "Auto strategy run complete");
        })
        .catch((err) => {
          logger.error({ err, scannerId }, "Auto strategy run failed");
        });
    } catch (err) {
      logger.error({ err, scannerId }, "Failed to import strategy runner");
    }
  }

  if (symbols.length === 0) {
    const durationMs = Date.now() - startTime;
    await db.insert(scanLogsTable).values({
      scannerId,
      stocksFound: 0,
      newAlerts: 0,
      symbols: [],
      error: null,
      durationMs,
    });
    return { stocksFound: stocks.length, newAlerts: 0, scannerName: scanner.name, durationMs };
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
  } else {
    logger.info({ scannerId, total: symbols.length }, "All symbols already alerted today");
  }

  const durationMs = Date.now() - startTime;

  logger.info({ scannerId, newAlerts, telegramSent, durationMs }, "Scan complete");

  await db.insert(scanLogsTable).values({
    scannerId,
    stocksFound: stocks.length,
    newAlerts,
    symbols,
    error: null,
    durationMs,
  });

  return { stocksFound: stocks.length, newAlerts, scannerName: scanner.name, durationMs };
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
    const market = getMarketStatus();
    if (!market.open) {
      logger.info({ scannerId, reason: market.reason }, "Skipping scan — market closed");
    } else {
      try {
        await runScanForScanner(scannerId);
      } catch (err) {
        logger.error({ err, scannerId }, "Scan failed");
      }
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

/** Returns the ISO timestamp of the next scheduled run for a scanner, or null if not scheduled. */
export function getNextScanAt(scannerId: number): string | null {
  const t = timers.get(scannerId);
  if (!t) return null;
  return new Date(t.nextRunAt).toISOString();
}

/** Fire-and-forget: queue a scan for every active scanner (reads from DB for reliability). */
export async function triggerAllScannersAsync(): Promise<number> {
  const activeScanners = await db
    .select({ id: scannersTable.id })
    .from(scannersTable)
    .where(eq(scannersTable.isActive, true));

  for (const s of activeScanners) {
    runScanForScanner(s.id).catch((err) => {
      logger.error({ err, scannerId: s.id }, "scan-all scan failed");
    });
  }
  logger.info({ count: activeScanners.length }, "Manual scan-all triggered");
  return activeScanners.length;
}

/**
 * Pause or resume ALL scanners.
 * - false: cancel all timers + mark isActive=false in DB
 * - true: mark ALL isActive=true in DB + schedule all timers
 */
export async function setAllScannersActive(isActive: boolean): Promise<number> {
  const all = await db.select().from(scannersTable);

  // Always stop every running timer first
  for (const s of all) {
    unscheduleScanner(s.id);
  }

  // Update DB
  await db.update(scannersTable).set({ isActive });

  // If resuming, schedule all of them
  if (isActive) {
    for (const s of all) {
      await scheduleScanner(s.id, s.intervalMinutes);
    }
  }

  return all.length;
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
