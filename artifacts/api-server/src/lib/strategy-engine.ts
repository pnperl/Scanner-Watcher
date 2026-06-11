/**
 * 15-Day Breakout Strategy Engine
 *
 * Logic:
 * 1. Compute 15-day high/low from daily candles
 * 2. Detect breakout when price crosses above 15-day high (or below 15-day low for short)
 * 3. Confirm with volume — current volume > 15-day average volume
 * 4. Confirm with momentum — 3% or more move above/below the level
 * 5. Generate signal: BUY, HOLD, NO_SIGNAL
 *
 * All processing uses pre-fetched candle data. No live API calls during strategy run.
 */

export interface Candle {
  symbol: string;
  interval: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BreakoutSignal {
  symbol: string;
  signalType: "buy" | "hold" | "exit" | "no_signal";
  breakoutPrice: number | null;
  day15High: number | null;
  day15Low: number | null;
  volumeAvg15d: number | null;
  currentVolume: number | null;
  confidence: number; // 0-1
  metadata: Record<string, unknown>;
}

export interface StrategyRunResult {
  signals: BreakoutSignal[];
  signalsFound: number;
  symbolsProcessed: number;
}

export interface BreakoutConfig {
  /** Minimum momentum % to confirm breakout (default 3%) */
  minMomentumPct?: number;
  /** Volume multiplier: current volume / avg volume (default 1.2 = 20% above average) */
  volumeMultiplier?: number;
  /** Lookback period in days (default 15) */
  lookbackDays?: number;
  /** If true, only generate buy signals (breakout above). If false, also generates exit signals (breakdown below). */
  longOnly?: boolean;
}

const DEFAULT_CONFIG: Required<BreakoutConfig> = {
  minMomentumPct: 3,
  volumeMultiplier: 1.2,
  lookbackDays: 15,
  longOnly: true,
};

/**
 * Group candles by symbol and interval, sort by timestamp.
 */
function groupBySymbol(candles: Candle[]): Map<string, Candle[]> {
  const map = new Map<string, Candle[]>();
  for (const c of candles) {
    const key = `${c.symbol}-${c.interval}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  return map;
}

/**
 * Compute 15-day high, low, and average volume from daily candles.
 */
function computeDailyStats(candles: Candle[], lookbackDays: number): {
  dayHigh: number;
  dayLow: number;
  avgVolume: number;
} | null {
  // Need at least lookbackDays + 1 candles (the most recent is the current day)
  if (candles.length < lookbackDays) return null;

  const lookback = candles.slice(-lookbackDays - 1, -1); // exclude today
  if (lookback.length === 0) return null;

  const highs = lookback.map((c) => c.high);
  const lows = lookback.map((c) => c.low);
  const volumes = lookback.map((c) => c.volume);

  const dayHigh = Math.max(...highs);
  const dayLow = Math.min(...lows);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  return { dayHigh, dayLow, avgVolume };
}

/**
 * Run the 15-day breakout strategy on a set of symbols.
 *
 * @param symbols - Symbols to analyze
 * @param candleData - All candle data for these symbols
 * @param config - Breakout configuration
 */
export function runBreakoutStrategy(
  symbols: string[],
  candleData: Candle[],
  config: BreakoutConfig = {},
): StrategyRunResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const grouped = groupBySymbol(candleData);

  const signals: BreakoutSignal[] = [];
  let signalsFound = 0;

  for (const symbol of symbols) {
    const dailyKey = `${symbol}-1d`;
    const dailyCandles = grouped.get(dailyKey) ?? [];
    const stats = computeDailyStats(dailyCandles, cfg.lookbackDays);

    if (!stats) {
      signals.push({
        symbol,
        signalType: "no_signal",
        breakoutPrice: null,
        day15High: null,
        day15Low: null,
        volumeAvg15d: null,
        currentVolume: null,
        confidence: 0,
        metadata: { reason: "Insufficient daily candle data" },
      });
      continue;
    }

    const { dayHigh, dayLow, avgVolume } = stats;

    // Get the most recent candle (today)
    const todayCandle = dailyCandles[dailyCandles.length - 1];
    if (!todayCandle) {
      signals.push({
        symbol,
        signalType: "no_signal",
        breakoutPrice: null,
        day15High: dayHigh,
        day15Low: dayLow,
        volumeAvg15d: avgVolume,
        currentVolume: null,
        confidence: 0,
        metadata: { reason: "No today's candle" },
      });
      continue;
    }

    const currentPrice = todayCandle.close;
    const currentVolume = todayCandle.volume;

    // Check if this symbol is already in a breakout position
    const momentumUp = ((currentPrice - dayHigh) / dayHigh) * 100;
    const momentumDown = ((currentPrice - dayLow) / dayLow) * 100;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

    let signalType: "buy" | "hold" | "exit" | "no_signal" = "no_signal";
    let confidence = 0;
    let breakoutPrice: number | null = null;

    // Breakout above 15-day high
    if (currentPrice >= dayHigh && momentumUp >= cfg.minMomentumPct) {
      if (volumeRatio >= cfg.volumeMultiplier) {
        signalType = "buy";
        confidence = Math.min(1, (momentumUp / 10) + (volumeRatio / 4) - 0.2);
        breakoutPrice = currentPrice;
      } else {
        // Volume not confirming
        signalType = "hold";
        confidence = Math.min(1, (momentumUp / 10) * 0.5);
        breakoutPrice = currentPrice;
      }
    } else if (currentPrice >= dayHigh && momentumUp < cfg.minMomentumPct) {
      // Touched the high but not enough momentum
      signalType = "hold";
      confidence = Math.min(0.5, momentumUp / 5);
      breakoutPrice = currentPrice;
    } else if (currentPrice > dayHigh && currentPrice < dayHigh * 1.01) {
      // Just above, watch it
      signalType = "hold";
      confidence = Math.min(0.3, momentumUp / 3);
      breakoutPrice = currentPrice;
    }

    // Breakdown below 15-day low (for exit signals if not long-only)
    if (!cfg.longOnly && currentPrice <= dayLow && Math.abs(momentumDown) >= cfg.minMomentumPct) {
      signalType = "exit";
      confidence = Math.min(1, (Math.abs(momentumDown) / 10) + (volumeRatio / 4) - 0.2);
      breakoutPrice = currentPrice;
    }

    if (signalType === "buy" || signalType === "exit") {
      signalsFound++;
    }

    signals.push({
      symbol,
      signalType,
      breakoutPrice,
      day15High: dayHigh,
      day15Low: dayLow,
      volumeAvg15d: avgVolume,
      currentVolume: currentVolume,
      confidence: Math.round(confidence * 100) / 100,
      metadata: {
        momentumUp: Math.round(momentumUp * 100) / 100,
        momentumDown: Math.round(momentumDown * 100) / 100,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        todayClose: currentPrice,
        todayHigh: todayCandle.high,
        todayLow: todayCandle.low,
      },
    });
  }

  return { signals, signalsFound, symbolsProcessed: symbols.length };
}
