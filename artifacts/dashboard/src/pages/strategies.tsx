import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListScanners, getListScannersQueryKey,
  useRunStrategy,
  useGetStrategyRuns, getGetStrategyRunsQueryKey,
  useGetStrategySignals, getGetStrategySignalsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { TrendingUp, Activity, Zap, Loader2, Target, BarChart3, ArrowUpRight } from "lucide-react";

export default function StrategiesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedScanner, setSelectedScanner] = useState<string>("all");

  const { data: scanners, isLoading: scannersLoading } = useListScanners({
    query: { queryKey: getListScannersQueryKey(), refetchInterval: 30000 },
  });

  const { data: runs, isLoading: runsLoading } = useGetStrategyRuns(
    selectedScanner !== "all" ? { scannerId: Number(selectedScanner) } : undefined,
    { query: { queryKey: getGetStrategyRunsQueryKey(selectedScanner !== "all" ? { scannerId: Number(selectedScanner) } : undefined), refetchInterval: 30000 } },
  );

  const { data: signals, isLoading: signalsLoading } = useGetStrategySignals(
    selectedScanner !== "all" ? { scannerId: Number(selectedScanner) } : undefined,
    { query: { queryKey: getGetStrategySignalsQueryKey(selectedScanner !== "all" ? { scannerId: Number(selectedScanner) } : undefined), refetchInterval: 30000 } },
  );

  const runMutation = useRunStrategy();

  const buySignals = signals?.filter((s) => s.signalType === "buy") ?? [];
  const holdSignals = signals?.filter((s) => s.signalType === "hold") ?? [];
  const latestRun = runs?.[0] ?? null;

  function handleRunStrategy() {
    if (selectedScanner === "all") {
      toast({ title: "Please select a scanner", variant: "destructive" });
      return;
    }
    const scannerId = Number(selectedScanner);
    runMutation.mutate(
      { data: { scannerId } },
      {
        onSuccess: (data) => {
          toast({
            title: `Strategy run complete`,
            description: `${data.signalsFound} signal${data.signalsFound !== 1 ? "s" : ""} found`,
          });
          void queryClient.invalidateQueries({ queryKey: getGetStrategyRunsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetStrategySignalsQueryKey() });
        },
        onError: () => {
          toast({ title: "Strategy run failed", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[color:var(--terminal-border-soft)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase font-mono">15-Day Breakout</h1>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider mt-0.5">
            Strategy engine — 15-day high/low breakout detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedScanner} onValueChange={setSelectedScanner}>
            <SelectTrigger className="w-[220px] rounded-none text-xs font-mono bg-[hsl(var(--terminal-panel))] border-[color:var(--terminal-border-soft)]">
              <SelectValue placeholder="Select scanner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-mono">All Scanners</SelectItem>
              {scanners?.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()} className="text-xs font-mono">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="rounded-none h-9 px-3 text-[10px] font-mono uppercase tracking-wider border-primary/50 text-primary hover:bg-primary/10 hover:border-primary disabled:opacity-50"
            onClick={handleRunStrategy}
            disabled={runMutation.isPending || selectedScanner === "all" || !scanners || scanners.length === 0}
          >
            {runMutation.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Zap className="h-3 w-3 mr-1.5" />}
            Run Now
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Runs" icon={<Activity className="h-3.5 w-3.5" />} loading={runsLoading} value={<span>{runs?.length ?? 0}</span>} />
        <StatCard label="BUY Signals" icon={<TrendingUp className="h-3.5 w-3.5" />} loading={signalsLoading} value={<span className="text-green-400">{buySignals.length}</span>} />
        <StatCard label="HOLD Signals" icon={<Target className="h-3.5 w-3.5" />} loading={signalsLoading} value={<span className="text-yellow-400">{holdSignals.length}</span>} />
        <StatCard label="Latest Run" icon={<BarChart3 className="h-3.5 w-3.5" />} loading={runsLoading}
          value={<span className="text-xl">{latestRun ? format(new Date(latestRun.runAt), "HH:mm") : "Never"}</span>} />
      </div>

      {/* Signals Table — show only buy/hold/exit signals, not no_signal */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          Strategy Signals
        </div>
        <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)]">
          {signalsLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !signals || signals.filter((s) => s.signalType !== "no_signal").length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs font-mono uppercase tracking-wider">
              No actionable signals yet. Run a strategy on a scanner.
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--terminal-border-soft)]">
              {signals.filter((s) => s.signalType !== "no_signal").map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Runs History */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          Run History
        </div>
        <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)]">
          {runsLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs font-mono uppercase tracking-wider">
              No runs yet
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--terminal-border-soft)]">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} scanners={scanners} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: any }) {
  const isBuy = signal.signalType === "buy";
  const isHold = signal.signalType === "hold";
  const isExit = signal.signalType === "exit";
  const isNoSignal = signal.signalType === "no_signal";
  const meta = signal.metadata as Record<string, number> | null;
  if (isNoSignal) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-[hsl(var(--terminal-panel-strong))] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <Badge variant="outline"
          className={`rounded-none text-[10px] font-mono px-1.5 py-0 border-transparent ${
            isBuy ? "bg-green-500/10 text-green-400" : isExit ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"
          }`}>
          {isBuy ? "BUY" : isExit ? "EXIT" : "HOLD"}
        </Badge>
        <span className="font-bold font-mono text-sm text-foreground">{signal.symbol}</span>
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {signal.breakoutPrice ? `₹${signal.breakoutPrice.toFixed(2)}` : "—"}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {signal.day15High && signal.day15Low && (
          <div className="text-[10px] font-mono text-muted-foreground/60 hidden sm:block">
            15d: <span className="text-green-400/80">{signal.day15High.toFixed(1)}</span> / <span className="text-red-400/80">{signal.day15Low.toFixed(1)}</span>
          </div>
        )}
        {signal.confidence != null && (
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-[hsl(var(--terminal-panel-strong))] border border-[color:var(--terminal-border-soft)] overflow-hidden">
              <div
                className={`h-full ${isBuy ? "bg-green-400" : isExit ? "bg-red-400" : "bg-yellow-400"}`}
                style={{ width: `${signal.confidence * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{Math.round(signal.confidence * 100)}%</span>
          </div>
        )}
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
          {formatDistanceToNow(new Date(signal.triggeredAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

function RunRow({ run, scanners }: { run: any; scanners?: Array<{ id: number; name: string }> | null }) {
  const scannerName = scanners?.find((s) => s.id === run.scannerId)?.name ?? `#${run.scannerId}`;
  const isSuccess = run.status === "completed";
  const isFailed = run.status === "failed";

  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-[hsl(var(--terminal-panel-strong))] transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`inline-flex h-1.5 w-1.5 rounded-full shrink-0 ${isSuccess ? "bg-green-500" : isFailed ? "bg-red-500" : "bg-yellow-500"}`} />
        <span className="font-mono text-sm text-foreground">{scannerName}</span>
        <span className="text-[10px] font-mono text-muted-foreground/60 hidden sm:inline">Run #{run.id}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
        </span>
        <span className={`text-[10px] font-mono ${isSuccess ? "text-green-400" : isFailed ? "text-red-400" : "text-yellow-400"}`}>
          {isSuccess ? `${run.signalsFound} signals` : run.error ?? run.status}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
          {formatDistanceToNow(new Date(run.runAt), { addSuffix: true })}
        </span>
      </div>
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
