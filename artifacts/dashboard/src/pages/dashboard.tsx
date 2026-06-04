import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStatsSummary, getGetStatsSummaryQueryKey,
  useGetRecentAlerts, getGetRecentAlertsQueryKey,
  useListScanners, getListScannersQueryKey,
  useGetScanTimeline, getGetScanTimelineQueryKey,
  useGetHourlyActivity, getGetHourlyActivityQueryKey,
  useGetCoOccurrence, getGetCoOccurrenceQueryKey,
  useScanAll,
  useToggleAll,
} from "@workspace/api-client-react";
import type { ScanLogEntry, ScannerTimeline } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { TrendingUp, Bell, Activity, Clock, CheckCircle2, XCircle, Play, Pause, Zap, Loader2 } from "lucide-react";

const POLL_INTERVAL_MS = 3_000;
const POLL_DURATION_MS = 90_000;

const MARKET_HOURS = Array.from({ length: 8 }, (_, i) => 9 + i); // 9–16

export default function Dashboard() {
  const [now, setNow] = useState(() => Date.now());
  const [isScanning, setIsScanning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useGetStatsSummary({
    query: { queryKey: getGetStatsSummaryQueryKey(), refetchInterval: 30000 },
  });
  const { data: recentAlerts, isLoading: alertsLoading } = useGetRecentAlerts(
    { limit: 15 },
    { query: { queryKey: getGetRecentAlertsQueryKey({ limit: 15 }), refetchInterval: 30000 } },
  );
  const { data: scanners, isLoading: scannersLoading } = useListScanners({
    query: { queryKey: getListScannersQueryKey(), refetchInterval: 30000 },
  });
  const { data: scanTimeline, isLoading: timelineLoading } = useGetScanTimeline({
    query: { queryKey: getGetScanTimelineQueryKey(), refetchInterval: 30000 },
  });
  const { data: hourlyActivity, isLoading: hourlyLoading } = useGetHourlyActivity({
    query: { queryKey: getGetHourlyActivityQueryKey(), refetchInterval: 60000 },
  });
  const { data: coOccurrence, isLoading: coLoading } = useGetCoOccurrence({
    query: { queryKey: getGetCoOccurrenceQueryKey(), refetchInterval: 60000 },
  });

  const scanAllMutation = useScanAll();
  const toggleAllMutation = useToggleAll();

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  function startRapidPoll() {
    setIsScanning(true);
    if (pollRef.current) clearInterval(pollRef.current);
    const deadline = Date.now() + POLL_DURATION_MS;
    pollRef.current = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: getGetScanTimelineQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey({ limit: 15 }) });
      void queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() });
      if (Date.now() >= deadline) stopRapidPoll();
    }, POLL_INTERVAL_MS);
  }

  function stopRapidPoll() {
    setIsScanning(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const nextScanInfo = useMemo(() => {
    if (!scanners) return null;
    const active = scanners.filter((s) => s.isActive && s.nextScanAt);
    if (active.length === 0) return null;
    let soonest: { name: string; nextAt: number } | null = null;
    for (const s of active) {
      const nextAt = new Date(s.nextScanAt!).getTime();
      if (!soonest || nextAt < soonest.nextAt) soonest = { name: s.name, nextAt };
    }
    return soonest;
  }, [scanners]);

  const nextScanCountdown = useMemo(() => {
    if (!nextScanInfo) return "—";
    const remaining = Math.max(0, nextScanInfo.nextAt - now);
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [now, nextScanInfo]);

  const nextScanLabel = useMemo(() => {
    if (!scanners) return "Loading...";
    const active = scanners.filter((s) => s.isActive);
    if (active.length === 0) return "All scanners paused";
    if (isScanning) return "Scanning now...";
    if (!nextScanInfo) return "Queued...";
    const remaining = Math.max(0, nextScanInfo.nextAt - now);
    if (remaining === 0) return "Running scan...";
    return nextScanInfo.name;
  }, [scanners, nextScanInfo, now, isScanning]);

  const allPaused = useMemo(() => {
    if (!scanners || scanners.length === 0) return false;
    return scanners.every((s) => !s.isActive);
  }, [scanners]);

  const hasActiveScanners = useMemo(() => scanners?.some((s) => s.isActive) ?? false, [scanners]);

  // Only show active scanners on dashboard
  const activeScanTimeline = useMemo(
    () => scanTimeline?.filter((s) => s.isActive) ?? [],
    [scanTimeline],
  );

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetScanTimelineQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetRecentAlertsQueryKey({ limit: 15 }) });
  }

  function handleScanAll() {
    scanAllMutation.mutate(undefined, {
      onSuccess: (data) => { if ((data?.triggered ?? 0) > 0) startRapidPoll(); },
    });
  }

  function handleToggleAll() {
    toggleAllMutation.mutate({ data: { isActive: allPaused } }, { onSuccess: invalidateAll });
  }

  const scanAllBusy = scanAllMutation.isPending || isScanning;
  const toggleAllBusy = toggleAllMutation.isPending || scannersLoading;
  const marketOpen = stats?.marketOpen ?? null;
  const marketReason = stats?.marketStatusReason ?? null;

  // Hourly heatmap data: build a 2D map of hour → scanner → count
  const { scannerNames, hourlyMax, hourlyGrid } = useMemo(() => {
    if (!hourlyActivity || hourlyActivity.length === 0)
      return { scannerNames: [], hourlyMax: 0, hourlyGrid: new Map() };
    const names = [...new Set(hourlyActivity.map((r) => r.scannerName))].sort();
    let max = 0;
    const grid = new Map<string, number>(); // `${hour}-${scannerName}`
    for (const r of hourlyActivity) {
      const key = `${r.hour}-${r.scannerName}`;
      grid.set(key, r.alertCount);
      if (r.alertCount > max) max = r.alertCount;
    }
    return { scannerNames: names, hourlyMax: max, hourlyGrid: grid };
  }, [hourlyActivity]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-[color:var(--terminal-border-soft)]">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight uppercase font-mono">Dashboard</h1>
            <Badge variant="outline" className="rounded-none border-primary text-primary text-[10px] font-mono py-0">LIVE</Badge>
            {marketOpen !== null && (
              <Badge variant="outline" className={`rounded-none text-[10px] font-mono py-0 ${marketOpen ? "border-green-500/50 text-green-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
                {marketOpen ? "MARKET OPEN" : "MARKET CLOSED"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
            Real-time market scanner overview
            {!marketOpen && marketReason && <span className="ml-2 text-muted-foreground/60">— {marketReason}</span>}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" variant="outline"
              className="rounded-none h-7 px-3 text-[10px] font-mono uppercase tracking-wider border-primary/50 text-primary hover:bg-primary/10 hover:border-primary disabled:opacity-50"
              onClick={handleScanAll} disabled={scanAllBusy || !hasActiveScanners}>
              {scanAllBusy ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Zap className="h-3 w-3 mr-1.5" />}
              {isScanning ? "Scanning..." : scanAllMutation.isPending ? "Queuing..." : "Scan Now"}
            </Button>
            <Button size="sm" variant="outline"
              className={`rounded-none h-7 px-3 text-[10px] font-mono uppercase tracking-wider disabled:opacity-50 ${allPaused ? "border-green-500/50 text-green-400 hover:bg-green-500/10 hover:border-green-500" : "border-muted-foreground/40 text-muted-foreground hover:bg-muted/20"}`}
              onClick={handleToggleAll} disabled={toggleAllBusy || !scanners || scanners.length === 0}>
              {toggleAllBusy ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : allPaused ? <Play className="h-3 w-3 mr-1.5" /> : <Pause className="h-3 w-3 mr-1.5" />}
              {toggleAllBusy ? "..." : allPaused ? "Resume All" : "Pause All"}
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-end text-right font-mono shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Next Scan</span>
          <span className={`text-4xl font-bold leading-none tabular-nums ${allPaused ? "text-muted-foreground/50" : isScanning ? "text-yellow-400" : "text-primary"}`}>
            {allPaused ? "--:--" : isScanning ? "NOW" : nextScanCountdown}
          </span>
          <span className="text-[10px] text-muted-foreground mt-1 max-w-[180px] truncate">{nextScanLabel}</span>
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Active Scanners" icon={<Activity className="h-3.5 w-3.5" />} loading={statsLoading}
          value={<span className="text-primary">{stats?.activeScanners}<span className="text-lg text-muted-foreground font-normal ml-1">/ {stats?.totalScanners}</span></span>} />
        <StatCard label="Alerts Today" icon={<Bell className="h-3.5 w-3.5" />} loading={statsLoading} value={<span>{stats?.alertsToday ?? 0}</span>} />
        <StatCard label="Total Alerts" icon={<TrendingUp className="h-3.5 w-3.5" />} loading={statsLoading} value={<span>{stats?.totalAlerts ?? 0}</span>} />
        <StatCard label="Last Scan" icon={<Clock className="h-3.5 w-3.5" />} loading={statsLoading}
          value={<span className="text-xl">{stats?.lastScanAt ? format(new Date(stats.lastScanAt), "HH:mm:ss") : "Never"}</span>} />
      </div>
      {/* Live Scanner Status — active only */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Live Scanners — Current Stocks &amp; Scan History
          </span>
          {isScanning && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-yellow-400 uppercase tracking-wider">
              <Loader2 className="h-3 w-3 animate-spin" /> Scanning
            </span>
          )}
        </div>
        {timelineLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-none" />)}
          </div>
        ) : activeScanTimeline.length === 0 ? (
          <div className="border border-dashed border-[color:var(--terminal-border-soft)] bg-[hsl(var(--terminal-panel))] py-10 text-center text-xs font-mono uppercase tracking-wider text-muted-foreground">
            No active scanners — enable a scanner on the Scanners page.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {activeScanTimeline.map((scanner) => (
              <ScannerStatusCard key={scanner.scannerId} scanner={scanner} isScanning={isScanning} />
            ))}
          </div>
        )}
      </div>
      {/* Hourly Activity + Co-occurrence + Recent Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Hourly heatmap */}
        <Card className="lg:col-span-2 bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)] rounded-none">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">
              Hourly Activity — Alerts by Time of Day (IST)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {hourlyLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : scannerNames.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider py-8 text-center">No alert data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-max">
                  {/* Hour labels */}
                  <div className="flex items-center gap-1 mb-1 ml-28">
                    {MARKET_HOURS.map((h) => (
                      <div key={h} className="w-7 text-[9px] font-mono text-muted-foreground/60 text-center">
                        {h.toString().padStart(2, "0")}
                      </div>
                    ))}
                  </div>
                  {/* Scanner rows */}
                  {scannerNames.map((name) => (
                    <div key={name} className="flex items-center gap-1 mb-1">
                      <div className="w-28 text-[10px] font-mono text-muted-foreground truncate pr-2 text-right shrink-0">{name}</div>
                      {MARKET_HOURS.map((h) => {
                        const count = hourlyGrid.get(`${h}-${name}`) ?? 0;
                        const intensity = hourlyMax > 0 ? count / hourlyMax : 0;
                        const opacity = count === 0 ? 0.06 : 0.15 + intensity * 0.85;
                        return (
                          <div key={h}
                            className="w-7 h-7 border border-[color:var(--terminal-border-soft)] flex items-center justify-center cursor-default"
                            style={{ backgroundColor: count === 0 ? undefined : `hsl(var(--primary) / ${opacity})` }}
                            title={`${name} @ ${h}:00–${h + 1}:00 IST — ${count} alerts`}>
                            <span className="text-[9px] font-mono font-bold bg-[#00000080]" style={{ color: count === 0 ? "hsl(var(--muted-foreground)/0.3)" : `hsl(var(--primary))` }}>
                              {count > 0 ? count : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div className="flex items-center gap-1 mt-2 ml-28">
                    <span className="text-[9px] font-mono text-muted-foreground/50 mr-1">Low</span>
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => (
                      <div key={v} className="w-4 h-3" style={{ backgroundColor: `hsl(var(--primary) / ${v})` }} />
                    ))}
                    <span className="text-[9px] font-mono text-muted-foreground/50 ml-1">High</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Signals */}
        <Card className="bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)] rounded-none flex flex-col">
          <CardHeader className="pb-2 px-5 pt-4 shrink-0">
            <CardTitle className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">Recent Signals</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4">
            {alertsLoading ? (
              <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : recentAlerts?.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 text-xs font-mono uppercase tracking-wider">No signals yet</div>
            ) : (
              <div className="divide-y divide-[color:var(--terminal-border-soft)]">
                {recentAlerts?.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <div className="font-bold font-mono text-sm tracking-tight text-foreground">{alert.symbol}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[110px]">{alert.scannerName}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm text-green-400 font-semibold">
                        {alert.price != null ? `₹${alert.price.toFixed(2)}` : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">{format(new Date(alert.triggeredAt), "HH:mm:ss")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Co-occurrence heatmap */}
      {(coLoading || (coOccurrence && coOccurrence.length > 0)) && (
        <Card className="bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)] rounded-none">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">
              Multi-Scanner Signals — Stocks that fired on 2+ scanners the same day
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {coLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {coOccurrence?.map((entry) => (
                  <div key={entry.symbol}
                    className="flex items-center gap-2 border border-[color:var(--terminal-border-soft)] bg-[hsl(var(--terminal-panel-strong))] px-3 py-1.5">
                    <span className="font-bold font-mono text-sm text-primary">{entry.symbol}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">×{entry.count}</span>
                    <div className="flex gap-1">
                      {entry.scanners.map((s) => (
                        <Badge key={s} variant="outline" className="rounded-none text-[9px] font-mono px-1 py-0 border-primary/30 text-primary/70">{s}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScannerStatusCard({ scanner, isScanning }: { scanner: ScannerTimeline; isScanning: boolean }) {
  const latest = scanner.recentScans[0] ?? null;
  const hasError = !!latest?.error;
  const hasStocks = (latest?.stocksFound ?? 0) > 0;

  const latencyLabel = useMemo(() => {
    if (!latest?.durationMs) return null;
    const ms = latest.durationMs;
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  }, [latest]);

  return (
    <div className={`bg-[hsl(var(--terminal-panel))] border flex flex-col ${
      isScanning ? "border-yellow-500/40"
      : hasError ? "border-red-500/30"
      : hasStocks ? "border-[color:var(--terminal-border-soft)]"
      : "border-[color:var(--terminal-border-soft)]"
    }`}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[color:var(--terminal-border-soft)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex h-1.5 w-1.5 rounded-full shrink-0 ${isScanning ? "bg-yellow-400 animate-pulse" : hasError ? "bg-red-500" : hasStocks ? "bg-green-500" : "bg-yellow-500"}`} />
          <span className="font-bold text-sm font-mono truncate">{scanner.scannerName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isScanning && (
            <Badge variant="outline" className="rounded-none text-[9px] font-mono px-1.5 py-0 border-yellow-500/40 text-yellow-400 animate-pulse">SCANNING</Badge>
          )}
          {latencyLabel && !isScanning && (
            <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums" title="Scan → result duration">
              {latencyLabel}
            </span>
          )}
          {latest && !isScanning && (
            <span className="text-[10px] font-mono text-muted-foreground/70">
              {formatDistanceToNow(new Date(latest.scannedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 flex-1">
        {isScanning ? (
          <div className="flex items-center gap-2 text-xs font-mono text-yellow-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            Contacting Chartink — results will appear shortly
          </div>
        ) : !latest ? (
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider py-2">No scans yet</div>
        ) : hasError ? (
          <div className="flex items-start gap-2">
            <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            <span className="text-xs font-mono text-red-400 break-all">{latest.error}</span>
          </div>
        ) : latest.stocksFound === 0 ? (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            Scanner ran — no stocks matched the criteria
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
              <span className="text-xs font-mono text-green-400 font-medium">
                {latest.stocksFound} stock{latest.stocksFound !== 1 ? "s" : ""} found
              </span>
              {latest.newAlerts > 0 ? (
                <Badge variant="outline" className="rounded-none text-[9px] font-mono px-1.5 py-0 bg-primary/10 text-primary border-primary/40">
                  {latest.newAlerts} new alert{latest.newAlerts !== 1 ? "s" : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-none text-[9px] font-mono px-1.5 py-0 text-muted-foreground border-muted-foreground/20">
                  all sent today
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {latest.symbols.slice(0, 20).map((sym) => (
                <span key={sym} className="inline-block px-1.5 py-0.5 bg-[hsl(var(--terminal-panel-strong))] border border-[color:var(--terminal-border-soft)] text-[10px] font-mono text-foreground">
                  {sym}
                </span>
              ))}
              {latest.symbols.length > 20 && (
                <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">+{latest.symbols.length - 20} more</span>
              )}
            </div>
          </div>
        )}
      </div>

      {scanner.recentScans.length > 0 && (
        <div className="px-4 pb-3 border-t border-[color:var(--terminal-border-soft)] pt-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-1.5">Last {scanner.recentScans.length} scans</div>
          <div className="flex items-end gap-1 h-8">
            {[...scanner.recentScans].reverse().map((scan, i) => (
              <ScanBar key={scan.id} scan={scan} index={i} total={scanner.recentScans.length} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScanBar({ scan, index, total }: { scan: ScanLogEntry; index: number; total: number }) {
  const isLatest = index === total - 1;
  const hasError = !!scan.error;
  const isEmpty = scan.stocksFound === 0 && !hasError;
  const hasNew = scan.newAlerts > 0;
  const barColor = hasError ? "bg-red-500" : isEmpty ? "bg-muted-foreground/30" : hasNew ? "bg-primary" : "bg-green-500/60";
  const maxStocks = 10;
  const heightPct = hasError ? 100 : isEmpty ? 20 : Math.min(100, Math.max(20, (scan.stocksFound / maxStocks) * 100));
  const dur = scan.durationMs;
  const durLabel = dur != null ? (dur >= 1000 ? `${(dur / 1000).toFixed(1)}s` : `${dur}ms`) : "";
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1 group relative"
      title={`${format(new Date(scan.scannedAt), "HH:mm")} — ${hasError ? scan.error : `${scan.stocksFound} stocks, ${scan.newAlerts} new`}${durLabel ? ` (${durLabel})` : ""}`}>
      <div className="w-full flex items-end justify-center h-7">
        <div className={`w-full rounded-none transition-opacity ${barColor} ${isLatest ? "opacity-100" : "opacity-60"}`} style={{ height: `${heightPct}%` }} />
      </div>
      {isLatest && <div className="w-1 h-1 rounded-full bg-primary" />}
    </div>
  );
}

function StatCard({ label, icon, loading, value }: { label: string; icon: React.ReactNode; loading: boolean; value: React.ReactNode }) {
  return (
    <Card className="bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)] rounded-none">
      <CardHeader className="pb-1 px-4 pt-4">
        <CardTitle className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-widest text-muted-foreground">
          {icon}{label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? <Skeleton className="h-8 w-20" /> : <div className="text-3xl font-bold font-mono leading-none">{value}</div>}
      </CardContent>
    </Card>
  );
}
