import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Scanners from "@/pages/scanners/index";
import NewScanner from "@/pages/scanners/new";
import ScannerDetail from "@/pages/scanners/[id]";
import Alerts from "@/pages/alerts";
import ConfigPage from "@/pages/config";
import { ThemeProvider } from "@/lib/theme-context";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/scanners" component={Scanners} />
        <Route path="/scanners/new" component={NewScanner} />
        <Route path="/scanners/:id" component={ScannerDetail} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/config" component={ConfigPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
