import { Activity, CheckCircle2, CircleAlert, RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../lib/api";

type Health = { status: "ok" | "degraded"; dependencies?: Record<string, string> };

const labels: Record<string, string> = {
  database: "Postgres / PostGIS",
  redis: "Redis dispatch",
  gis: "GIS Intelligence",
  googleRoutes: "Google routing",
};

function friendly(value: string) {
  return value === "ok" || value === "configured" ? "Operational" : value === "not_configured" ? "Not configured" : value === "checking" ? "Checking…" : "Unavailable";
}

export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch(apiUrl("/healthz"), { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      const data = await response.json() as Health;
      setHealth(data);
      setError(false);
    } catch {
      setHealth(null);
      setError(true);
    } finally {
      setCheckedAt(new Date());
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    return () => window.clearInterval(timer);
  }, [check]);

  const operational = health?.status === "ok";
  const initialCheck = checking && !health && !error;
  return <div className="status-page">
    <div className={`status-banner ${initialCheck ? "checking" : error ? "offline" : operational ? "healthy" : "degraded"}`}>
      {initialCheck ? <RefreshCw className="spinning" /> : error ? <WifiOff /> : operational ? <CheckCircle2 /> : <CircleAlert />}
      <div><strong>{initialCheck ? "Checking system readiness" : error ? "Status unavailable" : operational ? "All required systems operational" : "Service is degraded"}</strong><span>{error ? "The documentation site could not reach the API." : "Live data from the MOVE Apayao readiness endpoint."}</span></div>
      <button type="button" onClick={() => void check()} disabled={checking}><RefreshCw className={checking ? "spinning" : ""} size={16} />Refresh</button>
    </div>
    <div className="status-grid">
      {Object.keys(labels).map((name) => {
        const value = health?.dependencies?.[name] ?? (initialCheck ? "checking" : "unknown");
        const ok = value === "ok" || value === "configured";
        return <article key={name}><span className={`status-dot ${ok ? "ok" : value === "not_configured" ? "neutral" : "bad"}`} /><div><strong>{labels[name] ?? name}</strong><small>{friendly(value)}</small></div><Activity size={18} /></article>;
      })}
    </div>
    <p className="status-note">Automatically refreshes every 60 seconds. This check reads your API health only; it does not reload Google Maps or request a billable route.</p>
    <p className="checked-at">Last checked: {checkedAt ? checkedAt.toLocaleString() : "Waiting…"}</p>
  </div>;
}
