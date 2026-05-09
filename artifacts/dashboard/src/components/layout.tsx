import { Link, useLocation } from "wouter";
import { Activity, Bell, Scan, LayoutDashboard, Settings, MonitorDot } from "lucide-react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { useTheme } from "@/lib/theme-context";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { themeLabel } = useTheme();

  const { data: health } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 30000,
    },
  });

  const isLive = health?.status === "ok";

  const navItem = (href: string, active: boolean, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors border-l-2 ${
        active
          ? "border-primary bg-primary/10 text-primary font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60"
      }`}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans text-foreground">
      <aside className="w-full md:w-72 border-r border-[color:var(--terminal-border-soft)] bg-[hsl(var(--terminal-panel))] flex flex-col shrink-0">
        {/* Logo + status */}
        <div className="px-4 py-3 border-b border-[color:var(--terminal-border-soft)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-primary shrink-0" />
            <div>
              <span className="block font-bold tracking-tight uppercase text-sm leading-none">Chartink</span>
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider">MONITOR TERMINAL</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
              {isLive ? "LIVE" : "DOWN"}
            </span>
            <span className="relative flex h-2.5 w-2.5">
              {isLive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLive ? "bg-green-500" : "bg-red-500"}`} />
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2">
          {navItem("/", location === "/", <LayoutDashboard className="h-4 w-4" />, "Dashboard")}
          {navItem("/scanners", location.startsWith("/scanners"), <Scan className="h-4 w-4" />, "Scanners")}
          {navItem("/alerts", location.startsWith("/alerts"), <Bell className="h-4 w-4" />, "Alerts")}
          {navItem("/config", location.startsWith("/config"), <Settings className="h-4 w-4" />, "Config")}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[color:var(--terminal-border-soft)] space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <MonitorDot className="h-3.5 w-3.5 text-primary" />
            SYSTEM HEALTH: {isLive ? "OPTIMAL" : "DEGRADED"}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider">
            Mode: {themeLabel}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
