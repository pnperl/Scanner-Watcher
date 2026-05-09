import { useEffect, useMemo, useState } from "react";
import {
  useGetStatsSummary, getGetStatsSummaryQueryKey,
  useGetScannerActivity, getGetScannerActivityQueryKey,
  useGetRecentAlerts, getGetRecentAlertsQueryKey,
  useListScanners, getListScannersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { TrendingUp, Bell, Activity, Clock } from "lucide-react";

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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Find the soonest next-scan across all active scanners.
  // For scanners that have never been scanned, treat them as due immediately (nextAt = now - epsilon).
  const nextScanInfo = useMemo(() => {
    if (!scanners) return null;
    const active = scanners.filter((s) => s.isActive);
    if (active.length === 0) return null;

    let soonest: { name: string; nextAt: number } | null = null;
    for (const s of active) {
      // If never scanned, scanner fires very soon (first run on poller start)
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
        {/* Countdown */}
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

      {/* Chart + feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)] rounded-none">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">
              Scanner Activity — Alerts Per Scanner
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] px-2 pb-4">
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
