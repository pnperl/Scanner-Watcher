import { pgTable, serial, timestamp, integer, text, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import { scannersTable } from "./scanners";

export const strategyRunsTable = pgTable("strategy_runs", {
  id: serial("id").primaryKey(),
  scannerId: integer("scanner_id").notNull().references(() => scannersTable.id, { onDelete: "cascade" }),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status", { enum: ["pending", "running", "completed", "failed"] }).notNull().default("pending"),
  signalsFound: integer("signals_found").notNull().default(0),
  durationMs: integer("duration_ms"),
  error: text("error"),
  config: jsonb("config"),
});

export type StrategyRun = typeof strategyRunsTable.$inferSelect;
