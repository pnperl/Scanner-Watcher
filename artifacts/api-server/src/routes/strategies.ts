import { Router, type IRouter } from "express";
import { db, strategyRunsTable, strategySignalsTable, scannersTable, scanLogsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { runStrategy, getActiveSignals, getStrategyRuns, getRunSignals } from "../lib/strategy-runner";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /strategies/run
 * Trigger a strategy run for a scanner. Uses the latest scan log symbols.
 */
router.post("/strategies/run", async (req, res) => {
  const { scannerId, config, symbols } = req.body;
  if (!scannerId || typeof scannerId !== "number") {
    res.status(400).json({ error: "scannerId is required" });
    return;
  }

  const [scanner] = await db
    .select()
    .from(scannersTable)
    .where(eq(scannersTable.id, scannerId));

  if (!scanner) {
    res.status(404).json({ error: "Scanner not found" });
    return;
  }

  let symbolsToAnalyze: string[] = [];
  if (symbols && Array.isArray(symbols) && symbols.length > 0) {
    symbolsToAnalyze = symbols.filter((s: unknown) => typeof s === "string");
  } else {
    // Get the latest scan log for symbols
    const latestScan = await db
      .select()
      .from(scanLogsTable)
      .where(eq(scanLogsTable.scannerId, scannerId))
      .orderBy(desc(scanLogsTable.scannedAt))
      .limit(1);
    symbolsToAnalyze = latestScan[0]?.symbols ?? [];
  }

  if (symbolsToAnalyze.length === 0) {
    res.status(400).json({ error: "No symbols found for this scanner. Run a scan first, or provide symbols." });
    return;
  }

  try {
    const result = await runStrategy(scannerId, symbolsToAnalyze, config, false, scanner.name);
    res.status(200).json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, scannerId }, "Strategy run endpoint failed");
    res.status(500).json({ error: errorMsg });
  }
});

/**
 * GET /strategies/runs
 * List all strategy runs.
 */
router.get("/strategies/runs", async (req, res) => {
  const { scannerId } = req.query;
  let runs;
  if (scannerId && typeof scannerId === "string") {
    runs = await getStrategyRuns(Number(scannerId));
  } else {
    runs = await db
      .select()
      .from(strategyRunsTable)
      .orderBy(desc(strategyRunsTable.runAt));
  }
  res.json(runs);
});

/**
 * GET /strategies/runs/:id
 * Get a specific run with its signals.
 */
router.get("/strategies/runs/:id", async (req, res) => {
  const runId = Number(req.params.id);
  if (isNaN(runId)) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }

  const [run] = await db
    .select()
    .from(strategyRunsTable)
    .where(eq(strategyRunsTable.id, runId));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const signals = await getRunSignals(runId);
  res.json({ run, signals });
});

/**
 * GET /strategies/signals
 * Get all signals.
 */
router.get("/strategies/signals", async (req, res) => {
  const { scannerId, signalType } = req.query;
  if (scannerId && typeof scannerId === "string") {
    const sId = Number(scannerId);
    const cond = [eq(strategyRunsTable.scannerId, sId)];
    if (signalType && typeof signalType === "string" && ["buy", "hold", "exit", "no_signal"].includes(signalType)) {
      cond.push(eq(strategySignalsTable.signalType, signalType as "buy" | "hold" | "exit" | "no_signal"));
    }
    const signals = await db
      .select()
      .from(strategySignalsTable)
      .innerJoin(strategyRunsTable, eq(strategySignalsTable.runId, strategyRunsTable.id))
      .where(and(...cond))
      .orderBy(desc(strategySignalsTable.triggeredAt));
    res.json(signals.map((s) => s.strategy_signals));
  } else {
    const signals = await db
      .select()
      .from(strategySignalsTable)
      .orderBy(desc(strategySignalsTable.triggeredAt));
    res.json(signals);
  }
});

/**
 * GET /strategies/active
 * Get active signals for a scanner.
 */
router.get("/strategies/active", async (req, res) => {
  const { scannerId } = req.query;
  if (!scannerId || typeof scannerId !== "string") {
    res.status(400).json({ error: "scannerId is required" });
    return;
  }

  const signals = await getActiveSignals(Number(scannerId));
  res.json(signals);
});

export default router;
