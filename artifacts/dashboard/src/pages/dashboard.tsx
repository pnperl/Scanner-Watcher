import { useGetStatsSummary, getGetStatsSummaryQueryKey, useGetScannerActivity, getGetScannerActivityQueryKey, useGetRecentAlerts, getGetRecentAlertsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStatsSummary({
    query: {
      queryKey: getGetStatsSummaryQueryKey(),
      refetchInterval: 30000,
    }
  });

  const { data: activity, isLoading: activityLoading } = useGetScannerActivity({
    query: {
      queryKey: getGetScannerActivityQueryKey(),
      refetchInterval: 30000,
    }
  });

  const { data: recentAlerts, isLoading: alertsLoading } = useGetRecentAlerts({ limit: 10 }, {
    query: {
      queryKey: getGetRecentAlertsQueryKey({ limit: 10 }),
      refetchInterval: 30000,
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">Live market overview</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground font-mono">Active Scanners</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold text-primary">{stats?.activeScanners} <span className="text-lg text-muted-foreground">/ {stats?.totalScanners}</span></div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground font-mono">Alerts Today</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold">{stats?.alertsToday}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground font-mono">Total Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-3xl font-bold">{stats?.totalAlerts}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground font-mono">Last Scan</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-8 w-32" /> : (
              <div className="text-lg font-mono">{stats?.lastScanAt ? format(new Date(stats.lastScanAt), 'HH:mm:ss') : 'Never'}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card">
          <CardHeader>
            <CardTitle className="text-sm uppercase font-mono tracking-wider">Scanner Activity (Alerts)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {activityLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity}>
                  <XAxis dataKey="scannerName" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937' }} />
                  <Bar dataKey="alertCount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm uppercase font-mono tracking-wider">Recent Signals</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {alertsLoading ? (
              <div className="space-y-4">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {recentAlerts?.map(alert => (
                  <div key={alert.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                    <div>
                      <div className="font-bold tracking-tight text-white">{alert.symbol}</div>
                      <div className="text-xs text-muted-foreground">{alert.scannerName}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-green-400">₹{alert.price?.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground">{format(new Date(alert.triggeredAt), 'HH:mm:ss')}</div>
                    </div>
                  </div>
                ))}
                {recentAlerts?.length === 0 && (
                  <div className="text-center text-muted-foreground py-8 text-sm">No recent alerts</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}