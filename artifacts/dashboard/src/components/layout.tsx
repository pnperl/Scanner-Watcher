import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Bell, Scan, LayoutDashboard, Settings, MonitorDot, Palette } from "lucide-react";
import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const themeOptions = [
  { value: "theme-bloomberg", label: "Bloomberg" },
  { value: "theme-emerald", label: "Emerald" },
  { value: "theme-amber", label: "Amber" },
  { value: "theme-cobalt", label: "Cobalt" },
] as const;

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [theme, setTheme] = useState("theme-bloomberg");
  
  const { data: health } = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 30000,
    }
  });

  const isLive = health?.status === "ok";

  useEffect(() => {
    const savedTheme = localStorage.getItem("chartink-theme");
    if (savedTheme && themeOptions.some((option) => option.value === savedTheme)) {
      setTheme(savedTheme);
      return;
    }
    const root = document.documentElement;
    root.classList.remove(...themeOptions.map((option) => option.value));
    root.classList.add(theme);
    localStorage.setItem("chartink-theme", theme);
  }, [theme]);

  const currentThemeLabel = useMemo(
    () => themeOptions.find((option) => option.value === theme)?.label ?? "Bloomberg",
    [theme],
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans text-foreground">
      <aside className="w-full md:w-72 border-r border-[color:var(--terminal-border-soft)] bg-[hsl(var(--terminal-panel))] flex flex-col shrink-0">
        <div className="p-4 border-b border-[color:var(--terminal-border-soft)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <span className="block font-bold tracking-tight uppercase text-sm">Chartink Monitor</span>
              <span className="text-[10px] font-mono text-muted-foreground">Terminal</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono">LIVE</span>
            <span className="relative flex h-3 w-3">
              {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isLive ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
          </div>
        </div>
        
        <div className="p-4 border-b border-[color:var(--terminal-border-soft)] space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
            UI Mode
          </div>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="bg-background/50 border-[color:var(--terminal-border-soft)]">
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent>
              {themeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-[11px] font-mono text-muted-foreground">Mode: {currentThemeLabel}</div>
        </div>

        <nav className="p-4 flex-1 space-y-1">
          <Link href="/" className={`flex items-center gap-3 px-3 py-2 rounded-none border border-transparent transition-colors ${location === '/' ? 'bg-primary/10 text-primary border-[color:var(--terminal-border)]' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'}`}>
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link href="/scanners" className={`flex items-center gap-3 px-3 py-2 rounded-none border border-transparent transition-colors ${location.startsWith('/scanners') ? 'bg-primary/10 text-primary border-[color:var(--terminal-border)]' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'}`}>
            <Scan className="h-4 w-4" />
            Scanners
          </Link>
          <Link href="/alerts" className={`flex items-center gap-3 px-3 py-2 rounded-none border border-transparent transition-colors ${location.startsWith('/alerts') ? 'bg-primary/10 text-primary border-[color:var(--terminal-border)]' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'}`}>
            <Bell className="h-4 w-4" />
            Alerts
          </Link>
          <Link href="/config" className={`flex items-center gap-3 px-3 py-2 rounded-none border border-transparent transition-colors ${location.startsWith('/config') ? 'bg-primary/10 text-primary border-[color:var(--terminal-border)]' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'}`}>
            <Settings className="h-4 w-4" />
            Config
          </Link>
        </nav>
        
        <div className="p-4 border-t border-[color:var(--terminal-border-soft)] text-xs text-muted-foreground font-mono space-y-2">
          <div className="flex items-center gap-2">
            <MonitorDot className="h-4 w-4 text-primary" />
            SYSTEM HEALTH: {isLive ? 'OPTIMAL' : 'DEGRADED'}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Bloomberg-style terminal</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[linear-gradient(180deg,hsl(var(--terminal-background)),hsl(var(--background)))]">
          {children}
        </div>
      </main>
    </div>
  );
}