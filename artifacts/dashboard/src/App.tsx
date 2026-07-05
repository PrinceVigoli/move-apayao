import { useEffect } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import { Shell } from '@/components/shell';
import Overview from '@/pages/index';
import Trips from '@/pages/trips';
import Drivers from '@/pages/drivers';
import Incidents from '@/pages/incidents';
import Analytics from '@/pages/analytics';
import Wallets from '@/pages/wallets';
import Subscriptions from '@/pages/subscriptions';
import Loops from '@/pages/loops';
import Users from '@/pages/users';
import AuditLogs from '@/pages/audit-logs';
import NotFound from '@/pages/not-found';
import Login from '@/pages/login';
import { AuthProvider, useAuth } from '@/lib/auth-context';

const queryClient = new QueryClient();

function ProtectedApp() {
  const { session, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !session) {
      navigate('/login');
    }
  }, [isLoading, session, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <Shell>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/trips" component={Trips} />
        <Route path="/drivers" component={Drivers} />
        <Route path="/incidents" component={Incidents} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/wallets" component={Wallets} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/loops" component={Loops} />
        <Route path="/users" component={Users} />
        <Route path="/audit-logs" component={AuditLogs} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route component={ProtectedApp} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;