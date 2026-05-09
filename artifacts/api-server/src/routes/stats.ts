import { Router, type IRouter } from "express";
import { eq, count, desc, sql } from "drizzle-orm";
import { db, scannersTable, alertsTable } from "@workspace/db";
import { isTelegramEnabled } from "../lib/telegram";

const router: IRouter = Router();

router.get("/stats/summary", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      totalScanners: count(scannersTable.id),
    })
    .from(scannersTable);

  const [activeRow] = await db
    .select({ activeScanners: count(scannersTable.id) })
    .from(scannersTable)
    .where(eq(scannersTable.isActive, true));

  const [alertTotals] = await db
    .select({ totalAlerts: count(alertsTable.id) })
    .from(alertsTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [alertsToday] = await db
    .select({ alertsToday: count(alertsTable.id) })
    .from(alertsTable)
    .where(sql`${alertsTable.triggeredAt} >= ${today.toISOString()}`);

  const [lastScan] = await db
    .select({ lastScannedAt: scannersTable.lastScannedAt })
    .from(scannersTable)
    .orderBy(desc(scannersTable.lastScannedAt))
    .limit(1);

  res.json({
    totalScanners: totals?.totalScanners ?? 0,
    activeScanners: activeRow?.activeScanners ?? 0,
    totalAlerts: alertTotals?.totalAlerts ?? 0,
    alertsToday: alertsToday?.alertsToday ?? 0,
    lastScanAt: lastScan?.lastScannedAt?.toISOString() ?? null,
    telegramEnabled: isTelegramEnabled(),
  });
});

router.get("/stats/recent-alerts", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "20"), 10) || 20, 100);

  const rows = await db
    .select({
      id: alertsTable.id,
      scannerId: alertsTable.scannerId,
      scannerName: scannersTable.name,
      symbol: alertsTable.symbol,
      price: alertsTable.price,
      triggeredAt: alertsTable.triggeredAt,
      telegramSent: alertsTable.telegramSent,
    })
    .from(alertsTable)
    .innerJoin(scannersTable, eq(scannersTable.id, alertsTable.scannerId))
    .orderBy(desc(alertsTable.triggeredAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      ...r,
      triggeredAt: r.triggeredAt.toISOString(),
      price: r.price ?? null,
    }))
  );
});

router.get("/stats/scanner-activity", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      scannerId: scannersTable.id,
      scannerName: scannersTable.name,
      alertCount: count(alertsTable.id),
    })
    .from(scannersTable)
    .leftJoin(alertsTable, eq(alertsTable.scannerId, scannersTable.id))
    .groupBy(scannersTable.id, scannersTable.name)
    .orderBy(desc(count(alertsTable.id)));

  res.json(rows);
});

export default router;
