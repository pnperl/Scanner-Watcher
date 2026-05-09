import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scannersTable = pgTable("scanners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  chartinkUrl: text("chartink_url").notNull(),
  intervalMinutes: integer("interval_minutes").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
});

export const insertScannerSchema = createInsertSchema(scannersTable).omit({ id: true, createdAt: true });
export type InsertScanner = z.infer<typeof insertScannerSchema>;
export type Scanner = typeof scannersTable.$inferSelect;
