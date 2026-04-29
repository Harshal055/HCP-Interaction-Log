import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppShell } from "@/components/layout/AppShell";
import Dashboard from "@/pages/dashboard/Dashboard";
import HcpList from "@/pages/hcp/HcpList";
import InteractionsList from "@/pages/interaction/InteractionsList";
import LogInteraction from "@/pages/log/LogInteraction";
import InteractionDetail from "@/pages/interaction/InteractionDetail";
import HcpDetail from "@/pages/hcp/HcpDetail";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/log" component={LogInteraction} />
        <Route path="/hcps" component={HcpList} />
        <Route path="/hcps/:id" component={HcpDetail} />
        <Route path="/interactions" component={InteractionsList} />
        <Route path="/interactions/:id" component={InteractionDetail} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
