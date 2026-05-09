import { Router, type IRouter } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, scannersTable, alertsTable } from "@workspace/db";
import {
  CreateScannerBody,
  UpdateScannerBody,
  UpdateScannerParams,
  GetScannerParams,
  DeleteScannerParams,
  ToggleScannerParams,
  ToggleScannerBody,
  TriggerScanParams,
} from "@workspace/api-zod";
import { runScanForScanner, scheduleScanner, unscheduleScanner } from "../lib/poller";

const router: IRouter = Router();

async function getScannerWithCount(id: number) {
  const [row] = await db
    .select({
      id: scannersTable.id,
      name: scannersTable.name,
      chartinkUrl: scannersTable.chartinkUrl,
      intervalMinutes: scannersTable.intervalMinutes,
      isActive: scannersTable.isActive,
      description: scannersTable.description,
      createdAt: scannersTable.createdAt,
      lastScannedAt: scannersTable.lastScannedAt,
      alertCount: count(alertsTable.id),
    })
    .from(scannersTable)
    .leftJoin(alertsTable, eq(alertsTable.scannerId, scannersTable.id))
    .where(eq(scannersTable.id, id))
    .groupBy(scannersTable.id);
  return row;
}

router.get("/scanners", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: scannersTable.id,
      name: scannersTable.name,
      chartinkUrl: scannersTable.chartinkUrl,
      intervalMinutes: scannersTable.intervalMinutes,
      isActive: scannersTable.isActive,
      description: scannersTable.description,
      createdAt: scannersTable.createdAt,
      lastScannedAt: scannersTable.lastScannedAt,
      alertCount: count(alertsTable.id),
    })
    .from(scannersTable)
    .leftJoin(alertsTable, eq(alertsTable.scannerId, scannersTable.id))
    .groupBy(scannersTable.id)
    .orderBy(scannersTable.createdAt);

  res.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastScannedAt: r.lastScannedAt?.toISOString() ?? null,
    }))
  );
});

router.post("/scanners", async (req, res): Promise<void> => {
  const parsed = CreateScannerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [scanner] = await db
    .insert(scannersTable)
    .values({
      name: parsed.data.name,
      chartinkUrl: parsed.data.chartinkUrl,
      intervalMinutes: parsed.data.intervalMinutes ?? 5,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive ?? true,
    })
    .returning();

  if (!scanner) {
    res.status(500).json({ error: "Failed to create scanner" });
    return;
  }

  if (scanner.isActive) {
    await scheduleScanner(scanner.id, scanner.intervalMinutes);
  }

  res.status(201).json({
    ...scanner,
    createdAt: scanner.createdAt.toISOString(),
    lastScannedAt: scanner.lastScannedAt?.toISOString() ?? null,
    alertCount: 0,
  });
});

router.get("/scanners/:id", async (req, res): Promise<void> => {
  const params = GetScannerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const row = await getScannerWithCount(params.data.id);
  if (!row) {
    res.status(404).json({ error: "Scanner not found" });
    return;
  }

  res.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastScannedAt: row.lastScannedAt?.toISOString() ?? null,
  });
});

router.patch("/scanners/:id", async (req, res): Promise<void> => {
  const params = UpdateScannerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateScannerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(scannersTable)
    .set(parsed.data)
    .where(eq(scannersTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Scanner not found" });
    return;
  }

  if (updated.isActive) {
    await scheduleScanner(updated.id, updated.intervalMinutes);
  } else {
    unscheduleScanner(updated.id);
  }

  const row = await getScannerWithCount(updated.id);
  res.json({
    ...row,
    createdAt: row!.createdAt.toISOString(),
    lastScannedAt: row!.lastScannedAt?.toISOString() ?? null,
  });
});

router.delete("/scanners/:id", async (req, res): Promise<void> => {
  const params = DeleteScannerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(scannersTable)
    .where(eq(scannersTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Scanner not found" });
    return;
  }

  unscheduleScanner(params.data.id);
  res.sendStatus(204);
});

router.patch("/scanners/:id/toggle", async (req, res): Promise<void> => {
  const params = ToggleScannerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ToggleScannerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(scannersTable)
    .set({ isActive: parsed.data.isActive })
    .where(eq(scannersTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Scanner not found" });
    return;
  }

  if (updated.isActive) {
    await scheduleScanner(updated.id, updated.intervalMinutes);
  } else {
    unscheduleScanner(updated.id);
  }

  const row = await getScannerWithCount(updated.id);
  res.json({
    ...row,
    createdAt: row!.createdAt.toISOString(),
    lastScannedAt: row!.lastScannedAt?.toISOString() ?? null,
  });
});

router.post("/scanners/:id/scan", async (req, res): Promise<void> => {
  const params = TriggerScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await runScanForScanner(params.data.id);
  res.json(result);
});

export default router;
