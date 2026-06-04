import { Router, type IRouter } from "express";
import { eq, count, desc, sql } from "drizzle-orm";
import { db, scannersTable, alertsTable, scanLogsTable } from "@workspace/db";
import { isTelegramEnabled } from "../lib/telegram";
import { getMarketStatus } from "../lib/poller";

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

  const market = getMarketStatus();

  res.json({
    totalScanners: totals?.totalScanners ?? 0,
    activeScanners: activeRow?.activeScanners ?? 0,
    totalAlerts: alertTotals?.totalAlerts ?? 0,
    alertsToday: alertsToday?.alertsToday ?? 0,
    lastScanAt: lastScan?.lastScannedAt?.toISOString() ?? null,
    telegramEnabled: isTelegramEnabled(),
    marketOpen: market.open,
    marketStatusReason: market.reason ?? null,
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

router.get("/stats/scan-timeline", async (_req, res): Promise<void> => {
  // Get all scanners
  const scanners = await db
    .select()
    .from(scannersTable)
    .orderBy(desc(scannersTable.isActive), scannersTable.name);

  // Get the last 8 scan logs per scanner
  const logs = await db
    .select()
    .from(scanLogsTable)
    .orderBy(desc(scanLogsTable.scannedAt));

  // Group logs by scanner id, keep last 8 per scanner
  const logsByScanner = new Map<number, typeof logs>();
  for (const log of logs) {
    const existing = logsByScanner.get(log.scannerId) ?? [];
    if (existing.length < 8) {
      existing.push(log);
      logsByScanner.set(log.scannerId, existing);
    }
  }

  const timeline = scanners.map((scanner) => ({
    scannerId: scanner.id,
    scannerName: scanner.name,
    isActive: scanner.isActive,
    recentScans: (logsByScanner.get(scanner.id) ?? []).map((log) => ({
      id: log.id,
      scannedAt: log.scannedAt.toISOString(),
      stocksFound: log.stocksFound,
      newAlerts: log.newAlerts,
      symbols: log.symbols ?? [],
      error: log.error ?? null,
    })),
  }));

  res.json(timeline);
});

router.get("/stats/cooccurrence", async (_req, res): Promise<void> => {
  // Find symbols that appeared in alerts for 2+ different scanners on the same calendar day
  const rows = await db
    .select({
      symbol: alertsTable.symbol,
      scannerName: scannersTable.name,
      date: sql<string>`DATE(${alertsTable.triggeredAt} AT TIME ZONE 'Asia/Kolkata')`,
    })
    .from(alertsTable)
    .innerJoin(scannersTable, eq(scannersTable.id, alertsTable.scannerId))
    .orderBy(desc(alertsTable.triggeredAt));

  // Group by (date, symbol) → set of scanners
  const map = new Map<string, { symbol: string; scanners: Set<string> }>();
  for (const row of rows) {
    const key = `${row.date}::${row.symbol}`;
    const existing = map.get(key);
    if (existing) {
      existing.scanners.add(row.scannerName);
    } else {
      map.set(key, { symbol: row.symbol, scanners: new Set([row.scannerName]) });
    }
  }

  // Keep only symbols that appeared in 2+ scanners
  const result: { symbol: string; scanners: string[]; count: number }[] = [];
  const symbolMap = new Map<string, { scanners: Set<string>; count: number }>();
  for (const entry of map.values()) {
    if (entry.scanners.size >= 2) {
      const existing = symbolMap.get(entry.symbol);
      if (existing) {
        for (const s of entry.scanners) existing.scanners.add(s);
        existing.count++;
      } else {
        symbolMap.set(entry.symbol, { scanners: new Set(entry.scanners), count: 1 });
      }
    }
  }
  for (const [symbol, data] of symbolMap) {
    result.push({ symbol, scanners: [...data.scanners], count: data.count });
  }
  result.sort((a, b) => b.count - a.count);

  res.json(result.slice(0, 30));
});

router.get("/stats/scan-calendar", async (_req, res): Promise<void> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const scanRows = await db
    .select({
      date: sql<string>`DATE(${scanLogsTable.scannedAt} AT TIME ZONE 'Asia/Kolkata')`,
      scanCount: count(scanLogsTable.id),
      alertCount: sql<number>`SUM(${scanLogsTable.newAlerts})`,
    })
    .from(scanLogsTable)
    .where(sql`${scanLogsTable.scannedAt} >= ${thirtyDaysAgo.toISOString()}`)
    .groupBy(sql`DATE(${scanLogsTable.scannedAt} AT TIME ZONE 'Asia/Kolkata')`)
    .orderBy(sql`DATE(${scanLogsTable.scannedAt} AT TIME ZONE 'Asia/Kolkata')`);

  res.json(
    scanRows.map((r) => ({
      date: r.date,
      scanCount: Number(r.scanCount),
      alertCount: Number(r.alertCount ?? 0),
    }))
  );
});

router.get("/stats/hourly-activity", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${alertsTable.triggeredAt} AT TIME ZONE 'Asia/Kolkata')::integer`,
      scannerName: scannersTable.name,
      alertCount: count(alertsTable.id),
    })
    .from(alertsTable)
    .innerJoin(scannersTable, eq(scannersTable.id, alertsTable.scannerId))
    .groupBy(
      sql`EXTRACT(HOUR FROM ${alertsTable.triggeredAt} AT TIME ZONE 'Asia/Kolkata')`,
      scannersTable.name,
    )
    .orderBy(
      sql`EXTRACT(HOUR FROM ${alertsTable.triggeredAt} AT TIME ZONE 'Asia/Kolkata')`,
    );

  res.json(
    rows.map((r) => ({
      hour: r.hour,
      scannerName: r.scannerName,
      alertCount: Number(r.alertCount),
    }))
  );
});

export default router;
