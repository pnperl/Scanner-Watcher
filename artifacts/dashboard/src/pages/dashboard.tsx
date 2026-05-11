import { useEffect, useMemo, useState } from "react";
import {
  useGetStatsSummary, getGetStatsSummaryQueryKey,
  useGetScannerActivity, getGetScannerActivityQueryKey,
  useGetRecentAlerts, getGetRecentAlertsQueryKey,
  useListScanners, getListScannersQueryKey,
  useGetScanTimeline, getGetScanTimelineQueryKey,
} from "@workspace/api-client-react";
import type { ScanLogEntry, ScannerTimeline } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { TrendingUp, Bell, Activity, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export default function Dashboard() {
  const [now, setNow] = useState(() => Date.now());

  const { data: stats, isLoading: statsLoading } = useGetStatsSummary({
    query: { queryKey: getGetStatsSummaryQueryKey(), refetchInterval: 30000 },
  });

  const { data: activity, isLoading: activityLoading } = useGetScannerActivity({
    query: { queryKey: getGetScannerActivityQueryKey(), refetchInterval: 30000 },
  });

  const { data: recentAlerts, isLoading: alertsLoading } = useGetRecentAlerts(
    { limit: 15 },
    { query: { queryKey: getGetRecentAlertsQueryKey({ limit: 15 }), refetchInterval: 30000 } },
  );

  const { data: scanners } = useListScanners({
    query: { queryKey: getListScannersQueryKey(), refetchInterval: 30000 },
  });

  const { data: scanTimeline, isLoading: timelineLoading } = useGetScanTimeline({
    query: { queryKey: getGetScanTimelineQueryKey(), refetchInterval: 30000 },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const nextScanInfo = useMemo(() => {
    if (!scanners) return null;
    const active = scanners.filter((s) => s.isActive);
    if (active.length === 0) return null;

    let soonest: { name: string; nextAt: number } | null = null;
    for (const s of active) {
      const baseTime = s.lastScannedAt
        ? new Date(s.lastScannedAt).getTime()
        : Date.now() - s.intervalMinutes * 60 * 1000;
      const nextAt = baseTime + s.intervalMinutes * 60 * 1000;
      if (!soonest || nextAt < soonest.nextAt) {
        soonest = { name: s.name, nextAt };
      }
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
    if (!nextScanInfo) return "No active scanners";
    const remaining = Math.max(0, nextScanInfo.nextAt - now);
    if (remaining === 0) return "Scanning now...";
    return nextScanInfo.name;
  }, [now, nextScanInfo]);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-[color:var(--terminal-border-soft)]">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight uppercase font-mono">Dashboard</h1>
            <Badge variant="outline" className="rounded-none border-primary text-primary text-[10px] font-mono py-0">
              LIVE
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider">Real-time market scanner overview</p>
        </div>
        <div className="flex flex-col items-end text-right font-mono shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Next Scan</span>
          <span className="text-4xl font-bold text-primary leading-none tabular-nums">{nextScanCountdown}</span>
          <span className="text-[10px] text-muted-foreground mt-1 max-w-[160px] truncate">{nextScanLabel}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Active Scanners"
          icon={<Activity className="h-3.5 w-3.5" />}
          loading={statsLoading}
          value={
            <span className="text-primary">
              {stats?.activeScanners}
              <span className="text-lg text-muted-foreground font-normal ml-1">/ {stats?.totalScanners}</span>
            </span>
          }
        />
        <StatCard
          label="Alerts Today"
          icon={<Bell className="h-3.5 w-3.5" />}
          loading={statsLoading}
          value={<span>{stats?.alertsToday ?? 0}</span>}
        />
        <StatCard
          label="Total Alerts"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          loading={statsLoading}
          value={<span>{stats?.totalAlerts ?? 0}</span>}
        />
        <StatCard
          label="Last Scan"
          icon={<Clock className="h-3.5 w-3.5" />}
          loading={statsLoading}
          value={
            <span className="text-xl">
              {stats?.lastScanAt ? format(new Date(stats.lastScanAt), "HH:mm:ss") : "Never"}
            </span>
          }
        />
      </div>

      {/* Scanner Status — per-scanner live view */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          Scanner Status — Current Stocks &amp; Scan History
        </div>
        {timelineLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-none" />
            ))}
          </div>
        ) : !scanTimeline || scanTimeline.length === 0 ? (
          <div className="border border-dashed border-[color:var(--terminal-border-soft)] bg-[hsl(var(--terminal-panel))] py-10 text-center text-xs font-mono uppercase tracking-wider text-muted-foreground">
            No scan data yet — scanners will log results here after their first run.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {scanTimeline.map((scanner) => (
              <ScannerStatusCard key={scanner.scannerId} scanner={scanner} />
            ))}
          </div>
        )}
      </div>

      {/* Chart + feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)] rounded-none">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">
              Scanner Activity — Alerts Per Scanner
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] px-2 pb-4">
            {activityLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis
                    dataKey="scannerName"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontFamily: "var(--app-font-mono)" }}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => String(v)}
                    tick={{ fontFamily: "var(--app-font-mono)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--terminal-panel))",
                      border: "1px solid hsl(var(--terminal-border-soft))",
                      borderRadius: 0,
                      fontFamily: "var(--app-font-mono)",
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="alertCount" radius={[2, 2, 0, 0]}>
                    {activity?.map((_, i) => (
                      <Cell key={i} fill="hsl(var(--primary))" fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent signals */}
        <Card className="bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)] rounded-none flex flex-col">
          <CardHeader className="pb-2 px-5 pt-4 shrink-0">
            <CardTitle className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">
              Recent Signals
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4">
            {alertsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentAlerts?.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 text-xs font-mono uppercase tracking-wider">
                No signals yet
              </div>
            ) : (
              <div className="divide-y divide-[color:var(--terminal-border-soft)]">
                {recentAlerts?.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <div>
                      <div className="font-bold font-mono text-sm tracking-tight text-foreground">
                        {alert.symbol}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                        {alert.scannerName}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm text-green-400 font-semibold">
                        {alert.price != null ? `₹${alert.price.toFixed(2)}` : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {format(new Date(alert.triggeredAt), "HH:mm:ss")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScannerStatusCard({ scanner }: { scanner: ScannerTimeline }) {
  const latest = scanner.recentScans[0] ?? null;
  const hasError = !!latest?.error;
  const hasStocks = (latest?.stocksFound ?? 0) > 0;

  return (
    <div className={`bg-[hsl(var(--terminal-panel))] border flex flex-col ${
      !scanner.isActive
        ? "border-[color:var(--terminal-border-soft)] opacity-60"
        : hasError
        ? "border-red-500/30"
        : hasStocks
        ? "border-[color:var(--terminal-border-soft)] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
        : "border-[color:var(--terminal-border-soft)]"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[color:var(--terminal-border-soft)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex h-1.5 w-1.5 rounded-full shrink-0 ${
            !scanner.isActive ? "bg-muted-foreground/40" :
            hasError ? "bg-red-500" :
            hasStocks ? "bg-green-500" : "bg-yellow-500"
          }`} />
          <span className="font-bold text-sm font-mono truncate">{scanner.scannerName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!scanner.isActive && (
            <Badge variant="outline" className="rounded-none text-[9px] font-mono px-1.5 py-0 border-muted-foreground/30 text-muted-foreground">
              PAUSED
            </Badge>
          )}
          {latest && (
            <span className="text-[10px] font-mono text-muted-foreground/70">
              {formatDistanceToNow(new Date(latest.scannedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      {/* Status + latest stocks */}
      <div className="px-4 py-3 flex-1">
        {!latest ? (
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider py-2">
            No scans yet
          </div>
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
                <span
                  key={sym}
                  className="inline-block px-1.5 py-0.5 bg-[hsl(var(--terminal-panel-strong))] border border-[color:var(--terminal-border-soft)] text-[10px] font-mono text-foreground"
                >
                  {sym}
                </span>
              ))}
              {latest.symbols.length > 20 && (
                <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  +{latest.symbols.length - 20} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mini timeline — last 8 scans as bar indicators */}
      {scanner.recentScans.length > 0 && (
        <div className="px-4 pb-3 border-t border-[color:var(--terminal-border-soft)] pt-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-1.5">
            Last {scanner.recentScans.length} scans
          </div>
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

  const barColor = hasError
    ? "bg-red-500"
    : isEmpty
    ? "bg-muted-foreground/30"
    : hasNew
    ? "bg-primary"
    : "bg-green-500/60";

  // Scale bar height: min 20%, max 100% of 2rem (8 = 32px)
  const maxStocks = 10; // cap visual height at 10 stocks
  const heightPct = hasError
    ? 100
    : isEmpty
    ? 20
    : Math.min(100, Math.max(20, (scan.stocksFound / maxStocks) * 100));

  return (
    <div
      className="flex flex-col items-center gap-0.5 flex-1 group relative"
      title={`${format(new Date(scan.scannedAt), "HH:mm")} — ${
        hasError ? scan.error : `${scan.stocksFound} stocks, ${scan.newAlerts} new`
      }`}
    >
      <div className="w-full flex items-end justify-center h-7">
        <div
          className={`w-full rounded-none transition-opacity ${barColor} ${isLatest ? "opacity-100" : "opacity-60"}`}
          style={{ height: `${heightPct}%` }}
        />
      </div>
      {isLatest && (
        <div className="w-1 h-1 rounded-full bg-primary" />
      )}
    </div>
  );
}

function StatCard({
  label,
  icon,
  loading,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  value: React.ReactNode;
}) {
  return (
    <Card className="bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)] rounded-none">
      <CardHeader className="pb-1 px-4 pt-4">
        <CardTitle className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-widest text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-3xl font-bold font-mono leading-none">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
