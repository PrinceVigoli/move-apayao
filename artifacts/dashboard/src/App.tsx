import { lazy, Suspense, useEffect } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import { Shell } from '@/components/shell';
import { AuthProvider, useAuth } from '@/lib/auth-context';

const Overview = lazy(() => import('@/pages/index'));
const Trips = lazy(() => import('@/pages/trips'));
const Drivers = lazy(() => import('@/pages/drivers'));
const FleetMap = lazy(() => import('@/pages/fleet-map'));
const Incidents = lazy(() => import('@/pages/incidents'));
const Feedback = lazy(() => import('@/pages/feedback'));
const Analytics = lazy(() => import('@/pages/analytics'));
const Subscriptions = lazy(() => import('@/pages/subscriptions'));
const Loops = lazy(() => import('@/pages/loops'));
const Users = lazy(() => import('@/pages/users'));
const AuditLogs = lazy(() => import('@/pages/audit-logs'));
const FarePolicy = lazy(() => import('@/pages/fare-policy'));
const GisIntelligence = lazy(() => import('@/pages/gis-intelligence'));
const NotFound = lazy(() => import('@/pages/not-found'));
const Login = lazy(() => import('@/pages/login'));

const queryClient = new QueryClient();

function ProtectedApp() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === 'developer' && location !== '/gis-intelligence') {
      navigate('/gis-intelligence');
    }
  }, [isLoading, isAuthenticated, user?.role, location, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Do not mount provincial-admin pages even briefly for GIS-only developer
  // accounts while the URL redirect effect runs.
  if (user?.role === 'developer') {
    return (
      <Shell>
        <GisIntelligence />
      </Shell>
    );
  }

  return (
    <Shell>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/trips" component={Trips} />
        <Route path="/drivers" component={Drivers} />
        <Route path="/fleet" component={FleetMap} />
        <Route path="/incidents" component={Incidents} />
        <Route path="/feedback" component={Feedback} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/loops" component={Loops} />
        <Route path="/users" component={Users} />
        <Route path="/audit-logs" component={AuditLogs} />
        <Route path="/fare-policy" component={FarePolicy} />
        <Route path="/gis-intelligence">
          {user?.role === 'superadmin' ? <GisIntelligence /> : <NotFound />}
        </Route>
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
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>}>
              <Router />
            </Suspense>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
