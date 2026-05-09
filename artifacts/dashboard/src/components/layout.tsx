import { Link, useLocation } from "wouter";
import { Activity, Bell, Scan, LayoutDashboard, Settings } from "lucide-react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  
  const { data: health } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 30000,
    }
  });

  const isLive = health?.status === "ok";

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans text-foreground">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <span className="font-bold tracking-tight">Chartink Monitor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">STATUS</span>
            <span className="relative flex h-3 w-3">
              {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isLive ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
          </div>
        </div>
        
        <nav className="p-4 flex-1 space-y-1">
          <Link href="/" className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${location === '/' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link href="/scanners" className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${location.startsWith('/scanners') ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
            <Scan className="h-4 w-4" />
            Scanners
          </Link>
          <Link href="/alerts" className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${location.startsWith('/alerts') ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
            <Bell className="h-4 w-4" />
            Alerts
          </Link>
        </nav>
        
        <div className="p-4 border-t border-border text-xs text-muted-foreground font-mono">
          SYSTEM HEALTH: {isLive ? 'OPTIMAL' : 'DEGRADED'}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}