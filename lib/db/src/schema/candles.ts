import { pgTable, text, timestamp, integer, doublePrecision, index } from "drizzle-orm/pg-core";

export const candlesTable = pgTable(
  "candles",
  {
    symbol: text("symbol").notNull(),
    interval: text("interval").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
  },
  (t) => [
    index("candles_symbol_interval_ts_idx").on(t.symbol, t.interval, t.timestamp),
  ],
);

export type Candle = typeof candlesTable.$inferSelect;
