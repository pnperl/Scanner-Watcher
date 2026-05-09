import {
  useListScanners, getListScannersQueryKey,
  useToggleScanner,
  useGetScannerActivity, getGetScannerActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Settings2, Play, Pause, Scan } from "lucide-react";
import { format } from "date-fns";

export default function Scanners() {
  const queryClient = useQueryClient();

  const { data: scanners, isLoading } = useListScanners({
    query: { queryKey: getListScannersQueryKey(), refetchInterval: 30000 },
  });

  const { data: activity } = useGetScannerActivity({
    query: { queryKey: getGetScannerActivityQueryKey(), refetchInterval: 30000 },
  });

  const toggleScanner = useToggleScanner();

  const handleToggle = (id: number, currentActive: boolean) => {
    toggleScanner.mutate(
      { id, data: { isActive: !currentActive } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() }) },
    );
  };

  // Build a lookup: scannerName -> alertCount from the activity endpoint
  const alertCountByName = Object.fromEntries(
    (activity ?? []).map((a) => [a.scannerName, a.alertCount]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[color:var(--terminal-border-soft)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase font-mono">Scanners</h1>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider mt-0.5">
            Manage Chartink scanner configurations
          </p>
        </div>
        <Link href="/scanners/new">
          <Button size="sm" className="gap-2 rounded-none text-xs font-mono uppercase">
            <Plus className="h-3.5 w-3.5" />
            Add Scanner
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-none" />
          ))}
        </div>
      ) : scanners?.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-[color:var(--terminal-border-soft)] bg-[hsl(var(--terminal-panel))]">
          <Scan className="h-10 w-10 mx-auto text-muted-foreground mb-4 opacity-30" />
          <h3 className="font-mono font-medium uppercase tracking-wider text-sm">No scanners configured</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4 font-mono">
            Add your first Chartink scanner to start monitoring.
          </p>
          <Link href="/scanners/new">
            <Button variant="outline" size="sm" className="rounded-none font-mono text-xs uppercase">
              Create Scanner
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {scanners?.map((scanner) => {
            const alertCount = alertCountByName[scanner.name] ?? 0;
            return (
              <div
                key={scanner.id}
                className={`bg-[hsl(var(--terminal-panel))] border flex flex-col transition-all ${
                  scanner.isActive
                    ? "border-[color:var(--terminal-border-soft)] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
                    : "border-[color:var(--terminal-border-soft)] opacity-60"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-[color:var(--terminal-border-soft)]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex h-1.5 w-1.5 rounded-full shrink-0 ${
                          scanner.isActive ? "bg-green-500" : "bg-muted-foreground/40"
                        }`}
                      />
                      <h3 className="font-bold text-sm font-mono truncate" title={scanner.name}>
                        {scanner.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-mono rounded-none px-1.5 py-0 ${
                          scanner.isActive
                            ? "border-green-500/40 text-green-500"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        {scanner.isActive ? "ACTIVE" : "PAUSED"}
                      </Badge>
                      {alertCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono rounded-none px-1.5 py-0 border-primary/40 text-primary"
                        >
                          {alertCount} alerts
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-none border border-[color:var(--terminal-border-soft)] hover:border-primary/50"
                    onClick={() => handleToggle(scanner.id, scanner.isActive)}
                    disabled={toggleScanner.isPending}
                  >
                    {scanner.isActive ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>

                {/* Body */}
                <div className="px-4 py-3 flex-1">
                  <p className="text-xs text-muted-foreground line-clamp-2 font-mono min-h-[2.5rem]">
                    {scanner.description || "No description provided."}
                  </p>
                </div>

                {/* Stats + action */}
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-3 mb-3 pt-3 border-t border-[color:var(--terminal-border-soft)]">
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase font-mono tracking-widest mb-0.5">
                        Interval
                      </div>
                      <div className="font-mono text-sm font-semibold">{scanner.intervalMinutes} min</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground uppercase font-mono tracking-widest mb-0.5">
                        Last Scan
                      </div>
                      <div className="font-mono text-sm">
                        {scanner.lastScannedAt
                          ? format(new Date(scanner.lastScannedAt), "HH:mm")
                          : "Never"}
                      </div>
                    </div>
                  </div>

                  <Link href={`/scanners/${scanner.id}`} className="block">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full gap-2 rounded-none text-xs font-mono uppercase"
                    >
                      <Settings2 className="h-3 w-3" />
                      Configure
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
