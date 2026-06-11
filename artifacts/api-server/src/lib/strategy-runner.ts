import { db, candlesTable, strategyRunsTable, strategySignalsTable, alertsTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { runBreakoutStrategy, type BreakoutConfig } from "./strategy-engine";
import { logger } from "./logger";
import { sendTelegramAlert } from "./telegram";

/**
 * Fetch candles for the given symbols over the required period.
 * For a 15-day strategy, we need 16 days of daily candles.
 * Returns the candle data in the format the engine expects.
 */
async function fetchCandles(
  symbols: string[],
  interval: string,
  days: number,
): Promise<Array<{
  symbol: string;
  interval: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>> {
  // Need at least `days + 1` trading days worth of data
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - (days + 5)); // buffer for weekends

  const rows = await db
    .select()
    .from(candlesTable)
    .where(
      and(
        inArray(candlesTable.symbol, symbols),
        eq(candlesTable.interval, interval),
        sql`${candlesTable.timestamp} >= ${daysAgo.toISOString()}`
      )
    )
    .orderBy(desc(candlesTable.timestamp));

  return rows.map((r) => ({
    symbol: r.symbol,
    interval: r.interval,
    timestamp: r.timestamp,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}

/**
 * Generate mock candle data for testing / demo when no real data exists.
 */
function generateMockCandles(symbols: string[], days: number, interval: string): Array<{
  symbol: string;
  interval: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  const candles: ReturnType<typeof generateMockCandles> = [];
  const now = new Date();

  // Make 30% of symbols "breakout" candidates — they build a base, then break above
  // the rest are normal random walk
  const breakoutCandidates = new Set(symbols.slice(0, Math.ceil(symbols.length * 0.3)));

  for (const symbol of symbols) {
    const hash = symbol.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    let basePrice = 100 + (hash % 900);
    const isBreakout = breakoutCandidates.has(symbol);

    // Build 16 days of trading candles
    const tradingDays: Array<{ date: Date; open: number; high: number; low: number; close: number; volume: number }> = [];
    let i = 0;
    let d = new Date(now);
    while (tradingDays.length < days + 2) {
      d = new Date(now);
      d.setDate(d.getDate() - i);
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        // Generate price
        const volatility = 0.015;
        const change = (Math.random() - 0.5) * 2 * volatility;
        const open = basePrice;
        let close = basePrice * (1 + change);
        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);
        const volume = 100000 + Math.random() * 500000;
        tradingDays.push({ date: d, open, high, low, close, volume });
        basePrice = close;
      }
      i++;
    }
    // Reverse so chronological order (oldest first)
    tradingDays.reverse();

    // If breakout candidate, force the last day to break above the 15-day high
    if (isBreakout && tradingDays.length >= 2) {
      const lookback = tradingDays.slice(0, -1); // exclude last day
      const dayHigh = Math.max(...lookback.map((c) => c.high));
      const dayLow = Math.min(...lookback.map((c) => c.low));
      const avgVolume = lookback.reduce((a, c) => a + c.volume, 0) / lookback.length;

      // Last day: open near the high, close above it with +4% momentum
      const lastDay = tradingDays[tradingDays.length - 1];
      const breakoutPrice = dayHigh * 1.04;
      lastDay.open = dayHigh * 0.995;
      lastDay.close = breakoutPrice;
      lastDay.high = Math.max(lastDay.high, breakoutPrice * 1.005);
      lastDay.low = Math.min(lastDay.low, lastDay.open * 0.99);
      lastDay.volume = avgVolume * 1.5; // 50% above average
    }

    for (const td of tradingDays) {
      candles.push({
        symbol,
        interval,
        timestamp: td.date,
        open: td.open,
        high: td.high,
        low: td.low,
        close: td.close,
        volume: td.volume,
      });
    }
  }

  return candles;
}

/**
 * Run the 15-day breakout strategy for a given set of symbols.
 * Stores results in DB and optionally sends Telegram alerts for BUY signals.
 */
export async function runStrategy(
  scannerId: number,
  symbols: string[],
  config?: BreakoutConfig,
  sendTelegram: boolean = false,
  scannerName?: string,
): Promise<{
  runId: number;
  signalsFound: number;
  signals: Array<{ symbol: string; signalType: string; confidence: number }>;
}> {
  const startTime = Date.now();

  // Create run record
  const [runRecord] = await db
    .insert(strategyRunsTable)
    .values({
      scannerId,
      status: "running",
      config: config ?? null,
    })
    .returning();

  const runId = runRecord.id;

  try {
    const lookbackDays = config?.lookbackDays ?? 15;
    let candleData = await fetchCandles(symbols, "1d", lookbackDays);

    // If no real data exists, use mock data for demo
    const hasData = candleData.length > 0;
    if (!hasData) {
      logger.info({ scannerId, symbolCount: symbols.length }, "No candle data found, using mock data for demo");
      candleData = generateMockCandles(symbols, lookbackDays, "1d");
    }

    const result = runBreakoutStrategy(symbols, candleData, config);

    // Store signals — all signal types (buy, hold, exit, no_signal)
    const signalsToInsert = result.signals.map((s) => ({
        runId,
        symbol: s.symbol,
        signalType: s.signalType,
        breakoutPrice: s.breakoutPrice,
        day15High: s.day15High,
        day15Low: s.day15Low,
        volumeAvg15d: s.volumeAvg15d,
        currentVolume: s.currentVolume,
        confidence: s.confidence,
        metadata: s.metadata,
      }));

    if (signalsToInsert.length > 0) {
      await db.insert(strategySignalsTable).values(signalsToInsert);
    }

    const durationMs = Date.now() - startTime;

    await db
      .update(strategyRunsTable)
      .set({
        status: "completed",
        signalsFound: result.signalsFound,
        durationMs,
      })
      .where(eq(strategyRunsTable.id, runId));

    // Send Telegram for BUY signals if enabled
    const buySignals = result.signals.filter((s) => s.signalType === "buy");
    if (sendTelegram && buySignals.length > 0 && scannerName) {
      const buySymbols = buySignals.map((s) => s.symbol);
      const prices: Record<string, number | null> = {};
      for (const s of buySignals) {
        prices[s.symbol] = s.breakoutPrice ?? null;
      }
      await sendTelegramAlert(
        `${scannerName} — 15-Day Breakout Signals`,
        buySymbols,
        prices,
      );
    }

    logger.info(
      { runId, scannerId, signalsFound: result.signalsFound, processed: result.symbolsProcessed, durationMs, hasData },
      "Strategy run complete",
    );

    return {
      runId,
      signalsFound: result.signalsFound,
      signals: result.signals.map((s) => ({
        symbol: s.symbol,
        signalType: s.signalType,
        confidence: s.confidence,
      })),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;
    await db
      .update(strategyRunsTable)
      .set({ status: "failed", error: errorMsg, durationMs })
      .where(eq(strategyRunsTable.id, runId));
    logger.error({ runId, scannerId, error: errorMsg }, "Strategy run failed");
    throw err;
  }
}

/**
 * Get the latest active signals for a scanner.
 * An active signal is the most recent signal for each symbol that is still BUY or HOLD.
 */
export async function getActiveSignals(scannerId: number): Promise<Array<{
  id: number;
  symbol: string;
  signalType: string;
  breakoutPrice: number | null;
  day15High: number | null;
  day15Low: number | null;
  volumeAvg15d: number | null;
  currentVolume: number | null;
  confidence: number | null;
  triggeredAt: Date;
  metadata: Record<string, unknown> | null;
}>> {
  const latestSignals = await db
    .selectDistinctOn([strategySignalsTable.symbol])
    .from(strategySignalsTable)
    .innerJoin(strategyRunsTable, eq(strategySignalsTable.runId, strategyRunsTable.id))
    .where(
      and(
        eq(strategyRunsTable.scannerId, scannerId),
        sql`${strategySignalsTable.signalType} IN ('buy', 'hold')`,
      )
    )
    .orderBy(strategySignalsTable.symbol, desc(strategySignalsTable.triggeredAt));

  return latestSignals.map((r) => ({
    id: r.strategy_signals.id,
    symbol: r.strategy_signals.symbol,
    signalType: r.strategy_signals.signalType,
    breakoutPrice: r.strategy_signals.breakoutPrice,
    day15High: r.strategy_signals.day15High,
    day15Low: r.strategy_signals.day15Low,
    volumeAvg15d: r.strategy_signals.volumeAvg15d,
    currentVolume: r.strategy_signals.currentVolume,
    confidence: r.strategy_signals.confidence,
    triggeredAt: r.strategy_signals.triggeredAt,
    metadata: r.strategy_signals.metadata as Record<string, unknown> | null,
  }));
}

/**
 * Get all strategy runs for a scanner.
 */
export async function getStrategyRuns(scannerId: number) {
  return db
    .select()
    .from(strategyRunsTable)
    .where(eq(strategyRunsTable.scannerId, scannerId))
    .orderBy(desc(strategyRunsTable.runAt));
}

/**
 * Get signals for a specific run.
 */
export async function getRunSignals(runId: number) {
  return db
    .select()
    .from(strategySignalsTable)
    .where(eq(strategySignalsTable.runId, runId))
    .orderBy(desc(strategySignalsTable.confidence));
}
