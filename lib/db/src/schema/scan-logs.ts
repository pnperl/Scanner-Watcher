import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { scannersTable } from "./scanners";

export const scanLogsTable = pgTable("scan_logs", {
  id: serial("id").primaryKey(),
  scannerId: integer("scanner_id").notNull().references(() => scannersTable.id, { onDelete: "cascade" }),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  stocksFound: integer("stocks_found").notNull().default(0),
  newAlerts: integer("new_alerts").notNull().default(0),
  symbols: text("symbols").array().notNull().default([]),
  error: text("error"),
  durationMs: integer("duration_ms"),
});

export type ScanLog = typeof scanLogsTable.$inferSelect;
