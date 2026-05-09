import { useState } from "react";
import {
  useListAlerts, getListAlertsQueryKey,
  useListScanners, getListScannersQueryKey,
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Alerts() {
  const [scannerId, setScannerId] = useState<string>("all");

  const filter = scannerId !== "all" ? { scannerId: Number(scannerId) } : {};

  const { data: alerts, isLoading } = useListAlerts(filter, {
    query: {
      queryKey: getListAlertsQueryKey(filter),
      refetchInterval: 30000,
    },
  });

  const { data: scanners } = useListScanners({
    query: { queryKey: getListScannersQueryKey() },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[color:var(--terminal-border-soft)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase font-mono">Alerts Log</h1>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider mt-0.5">
            Real-time signal feed
          </p>
        </div>

        <Select value={scannerId} onValueChange={setScannerId}>
          <SelectTrigger className="w-[200px] rounded-none text-xs font-mono bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)]">
            <SelectValue placeholder="Filter by scanner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs font-mono">All Scanners</SelectItem>
            {scanners?.map((s) => (
              <SelectItem key={s.id} value={s.id.toString()} className="text-xs font-mono">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)]">
        <Table>
          <TableHeader>
            <TableRow className="border-[color:var(--terminal-border-soft)] hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Symbol
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Price
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Scanner
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-right">
                Time
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-right">
                Telegram
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-[color:var(--terminal-border-soft)]">
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : alerts?.length === 0 ? (
              <TableRow className="border-[color:var(--terminal-border-soft)]">
                <TableCell
                  colSpan={5}
                  className="text-center py-16 text-muted-foreground font-mono text-xs uppercase tracking-wider"
                >
                  No alerts found
                </TableCell>
              </TableRow>
            ) : (
              alerts?.map((alert) => (
                <TableRow
                  key={alert.id}
                  className="border-[color:var(--terminal-border-soft)] hover:bg-[hsl(var(--terminal-panel-strong))] transition-colors"
                >
                  <TableCell className="font-bold font-mono text-foreground py-2.5">
                    {alert.symbol}
                  </TableCell>
                  <TableCell className="font-mono text-green-400 py-2.5">
                    {alert.price != null ? `₹${alert.price.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono py-2.5">
                    {alert.scannerName}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono text-muted-foreground py-2.5 tabular-nums">
                    {format(new Date(alert.triggeredAt), "MMM d, HH:mm:ss")}
                  </TableCell>
                  <TableCell className="text-right py-2.5">
                    {alert.telegramSent ? (
                      <Badge
                        variant="outline"
                        className="rounded-none text-[9px] font-mono px-1.5 py-0 bg-green-500/10 text-green-400 border-green-500/30"
                      >
                        SENT
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="rounded-none text-[9px] font-mono px-1.5 py-0 text-muted-foreground border-muted-foreground/30"
                      >
                        FAILED
                      </Badge>
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
