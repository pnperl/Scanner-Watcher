import { pgTable, serial, timestamp, integer, text, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { strategyRunsTable } from "./strategy-runs";

export const strategySignalsTable = pgTable("strategy_signals", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => strategyRunsTable.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  signalType: text("signal_type", { enum: ["buy", "hold", "exit", "no_signal"] }).notNull().default("no_signal"),
  breakoutPrice: doublePrecision("breakout_price"),
  day15High: doublePrecision("day15_high"),
  day15Low: doublePrecision("day15_low"),
  volumeAvg15d: doublePrecision("volume_avg_15d"),
  currentVolume: doublePrecision("current_volume"),
  confidence: doublePrecision("confidence"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

export type StrategySignal = typeof strategySignalsTable.$inferSelect;
