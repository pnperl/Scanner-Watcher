import { useState } from "react";
import {
  useListAlerts, getListAlertsQueryKey,
  useListScanners, getListScannersQueryKey,
  useGetScanCalendar, getGetScanCalendarQueryKey,
} from "@workspace/api-client-react";
import type { ScanCalendarDay } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, eachDayOfInterval, subDays, startOfDay } from "date-fns";
import { Download } from "lucide-react";

export default function Alerts() {
  const [scannerId, setScannerId] = useState<string>("all");

  const filter = scannerId !== "all" ? { scannerId: Number(scannerId) } : {};

  const { data: alerts, isLoading } = useListAlerts(filter, {
    query: { queryKey: getListAlertsQueryKey(filter), refetchInterval: 30000 },
  });

  const { data: scanners } = useListScanners({
    query: { queryKey: getListScannersQueryKey() },
  });

  const { data: calendar, isLoading: calLoading } = useGetScanCalendar({
    query: { queryKey: getGetScanCalendarQueryKey(), refetchInterval: 60000 },
  });

  function exportCSV() {
    if (!alerts || alerts.length === 0) return;
    const header = ["Symbol", "Price", "Scanner", "Time (IST)", "Telegram"];
    const rows = alerts.map((a) => [
      a.symbol,
      a.price != null ? a.price.toFixed(2) : "",
      a.scannerName,
      format(new Date(a.triggeredAt), "yyyy-MM-dd HH:mm:ss"),
      a.telegramSent ? "Yes" : "No",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alerts-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[color:var(--terminal-border-soft)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase font-mono">Alerts Log</h1>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider mt-0.5">Real-time signal feed</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={scannerId} onValueChange={setScannerId}>
            <SelectTrigger className="w-[180px] rounded-none text-xs font-mono bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)]">
              <SelectValue placeholder="Filter by scanner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-mono">All Scanners</SelectItem>
              {scanners?.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()} className="text-xs font-mono">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline"
            className="rounded-none h-9 px-3 text-[10px] font-mono uppercase tracking-wider border-[color:var(--terminal-border-soft)] text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={exportCSV} disabled={!alerts || alerts.length === 0}>
            <Download className="h-3 w-3 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* 30-day scan calendar */}
      <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)] p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          30-Day Scan Activity Calendar
        </div>
        {calLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ScanCalendar days={calendar ?? []} />
        )}
      </div>

      {/* Alerts table */}
      <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)]">
        <Table>
          <TableHeader>
            <TableRow className="border-[color:var(--terminal-border-soft)] hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Symbol</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Price</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Scanner</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-right">Time</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-right">Telegram</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-[color:var(--terminal-border-soft)]">
                  <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))
            ) : alerts?.length === 0 ? (
              <TableRow className="border-[color:var(--terminal-border-soft)]">
                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground font-mono text-xs uppercase tracking-wider">
                  No alerts found
                </TableCell>
              </TableRow>
            ) : (
              alerts?.map((alert) => (
                <TableRow key={alert.id} className="border-[color:var(--terminal-border-soft)] hover:bg-[hsl(var(--terminal-panel-strong))] transition-colors">
                  <TableCell className="font-bold font-mono text-foreground py-2.5">{alert.symbol}</TableCell>
                  <TableCell className="font-mono text-green-400 py-2.5">
                    {alert.price != null ? `₹${alert.price.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono py-2.5">{alert.scannerName}</TableCell>
                  <TableCell className="text-right text-xs font-mono text-muted-foreground py-2.5 tabular-nums">
                    {format(new Date(alert.triggeredAt), "MMM d, HH:mm:ss")}
                  </TableCell>
                  <TableCell className="text-right py-2.5">
                    {alert.telegramSent ? (
                      <Badge variant="outline" className="rounded-none text-[9px] font-mono px-1.5 py-0 bg-green-500/10 text-green-400 border-green-500/30">SENT</Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-none text-[9px] font-mono px-1.5 py-0 text-muted-foreground border-muted-foreground/30">FAILED</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ScanCalendar({ days }: { days: ScanCalendarDay[] }) {
  const today = startOfDay(new Date());
  const start = subDays(today, 29);
  const allDays = eachDayOfInterval({ start, end: today });

  // Build lookup by date string
  const dataMap = new Map<string, ScanCalendarDay>();
  for (const d of days) dataMap.set(d.date, d);

  const maxAlerts = Math.max(1, ...days.map((d) => d.alertCount));
  const maxScans = Math.max(1, ...days.map((d) => d.scanCount));

  // Group into weeks (columns of 7)
  const weeks: Date[][] = [];
  let week: Date[] = [];
  for (const day of allDays) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) weeks.push(week);

  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {w.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const data = dataMap.get(key);
              const alertCount = data?.alertCount ?? 0;
              const scanCount = data?.scanCount ?? 0;
              const isToday = key === format(today, "yyyy-MM-dd");

              let bg = "hsl(var(--terminal-panel-strong))";
              if (alertCount > 0) {
                const intensity = alertCount / maxAlerts;
                bg = `hsl(var(--primary) / ${0.15 + intensity * 0.85})`;
              } else if (scanCount > 0) {
                const intensity = scanCount / maxScans;
                bg = `hsl(var(--muted-foreground) / ${0.1 + intensity * 0.2})`;
              }

              return (
                <div key={key}
                  className={`w-5 h-5 border cursor-default transition-opacity ${isToday ? "border-primary/60" : "border-[color:var(--terminal-border-soft)]"}`}
                  style={{ backgroundColor: bg }}
                  title={`${format(day, "MMM d")} — ${scanCount} scan${scanCount !== 1 ? "s" : ""}, ${alertCount} new alert${alertCount !== 1 ? "s" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/60">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 border border-[color:var(--terminal-border-soft)]" style={{ backgroundColor: "hsl(var(--terminal-panel-strong))" }} />
          No activity
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 border border-[color:var(--terminal-border-soft)]" style={{ backgroundColor: "hsl(var(--muted-foreground)/0.2)" }} />
          Scans only
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 border border-[color:var(--terminal-border-soft)]" style={{ backgroundColor: "hsl(var(--primary)/0.7)" }} />
          Alerts
        </span>
      </div>
    </div>
  );
}
