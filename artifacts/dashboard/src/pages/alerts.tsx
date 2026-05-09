import { useState } from "react";
import { useListAlerts, getListAlertsQueryKey, useListScanners, getListScannersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function Alerts() {
  const [scannerId, setScannerId] = useState<string>("all");

  const { data: alerts, isLoading } = useListAlerts(
    scannerId !== "all" ? { scannerId: Number(scannerId) } : {}, 
    {
      query: {
        queryKey: getListAlertsQueryKey(scannerId !== "all" ? { scannerId: Number(scannerId) } : {}),
        refetchInterval: 30000,
      }
    }
  );

  const { data: scanners } = useListScanners({
    query: {
      queryKey: getListScannersQueryKey(),
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alerts Log</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">Real-time signal feed</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={scannerId} onValueChange={setScannerId}>
            <SelectTrigger className="w-[200px] bg-card border-border">
              <SelectValue placeholder="Filter by scanner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scanners</SelectItem>
              {scanners?.map(s => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-background/50">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase">Symbol</TableHead>
                <TableHead className="font-mono text-xs uppercase">Price</TableHead>
                <TableHead className="font-mono text-xs uppercase">Scanner</TableHead>
                <TableHead className="font-mono text-xs uppercase text-right">Time</TableHead>
                <TableHead className="font-mono text-xs uppercase text-right">Telegram</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading alerts...</TableCell>
                </TableRow>
              ) : alerts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No alerts found</TableCell>
                </TableRow>
              ) : alerts?.map(alert => (
                <TableRow key={alert.id} className="border-border border-b hover:bg-secondary/50 transition-colors">
                  <TableCell className="font-bold text-white">{alert.symbol}</TableCell>
                  <TableCell className="font-mono text-green-400">₹{alert.price?.toFixed(2) || "N/A"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{alert.scannerName}</TableCell>
                  <TableCell className="text-right text-sm font-mono text-muted-foreground">
                    {format(new Date(alert.triggeredAt), 'MMM d, HH:mm:ss')}
                  </TableCell>
                  <TableCell className="text-right">
                    {alert.telegramSent ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 font-mono rounded-sm">SENT</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted/50 text-muted-foreground font-mono rounded-sm">FAILED</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}