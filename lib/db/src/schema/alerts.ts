import { pgTable, text, timestamp, integer, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { scannersTable } from "./scanners";

export const alertsTable = pgTable("alerts", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  scannerId: integer("scanner_id").notNull().references(() => scannersTable.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  price: doublePrecision("price"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  telegramSent: boolean("telegram_sent").notNull().default(false),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ triggeredAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
