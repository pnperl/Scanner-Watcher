import { useListScanners, getListScannersQueryKey, useToggleScanner } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Settings, Play, Pause } from "lucide-react";
import { format } from "date-fns";

export default function Scanners() {
  const queryClient = useQueryClient();
  
  const { data: scanners, isLoading } = useListScanners({
    query: {
      queryKey: getListScannersQueryKey(),
    }
  });

  const toggleScanner = useToggleScanner();

  const handleToggle = (id: number, currentActive: boolean) => {
    toggleScanner.mutate({ id, data: { isActive: !currentActive } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scanners</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">Manage Chartink configurations</p>
        </div>
        <Link href="/scanners/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Scanner
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </>
        ) : scanners?.map(scanner => (
          <Card key={scanner.id} className={`bg-card transition-all ${scanner.isActive ? 'border-primary/50 shadow-[0_0_15px_rgba(0,255,255,0.05)]' : 'opacity-75 grayscale-[30%]'}`}>
            <CardContent className="p-5 flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-lg truncate max-w-[200px]" title={scanner.name}>{scanner.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-2 w-2 rounded-full ${scanner.isActive ? 'bg-green-500' : 'bg-muted-foreground'}`}></span>
                    <span className="text-xs font-mono text-muted-foreground uppercase">{scanner.isActive ? 'ACTIVE' : 'PAUSED'}</span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleToggle(scanner.id, scanner.isActive)}
                  disabled={toggleScanner.isPending}
                >
                  {scanner.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </div>

              <div className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">
                {scanner.description || "No description provided."}
              </div>

              <div className="mt-auto grid grid-cols-2 gap-4 border-t border-border pt-4">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Interval</div>
                  <div className="font-medium text-sm">{scanner.intervalMinutes} min</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Last Scan</div>
                  <div className="font-mono text-xs mt-0.5">{scanner.lastScannedAt ? format(new Date(scanner.lastScannedAt), 'HH:mm') : 'Never'}</div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Link href={`/scanners/${scanner.id}`} className="w-full">
                  <Button variant="secondary" className="w-full gap-2 h-8 text-xs">
                    <Settings className="h-3 w-3" />
                    Configure
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {scanners?.length === 0 && !isLoading && (
        <div className="text-center py-24 border border-dashed border-border rounded-lg bg-card/50">
          <Scan className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No scanners configured</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Add your first Chartink scanner to start monitoring.</p>
          <Link href="/scanners/new">
            <Button variant="outline">Create Scanner</Button>
          </Link>
        </div>
      )}
    </div>
  );
}