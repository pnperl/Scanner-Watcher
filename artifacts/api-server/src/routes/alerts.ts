import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, alertsTable, scannersTable } from "@workspace/db";
import { ListAlertsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/alerts", async (req, res): Promise<void> => {
  const parsed = ListAlertsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { scannerId, symbol, limit } = parsed.data;

  let query = db
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
    .limit(limit ?? 100)
    .$dynamic();

  if (scannerId != null) {
    query = query.where(eq(alertsTable.scannerId, scannerId));
  }

  const rows = await query;

  res.json(
    rows.map((r) => ({
      ...r,
      triggeredAt: r.triggeredAt.toISOString(),
      price: r.price ?? null,
    }))
  );
});

export default router;
