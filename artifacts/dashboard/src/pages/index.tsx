import { useMemo } from "react"
import { useGetAnalyticsSummary, useGetDailyAnalytics } from "@workspace/api-client-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPHP } from "@/lib/utils"
import { useLiveDrivers } from "@/lib/fleet"
import { Activity, AlertTriangle, CarFront, CheckCircle2, MapPin, Users, Wallet } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default function Overview() {
  const dateRange = useMemo(() => {
    const end = new Date()
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 6)
    return { startDate: toDateInput(start), endDate: toDateInput(end) }
  }, [])

  const { data: summary, isLoading: isLoadingSummary, isError: isSummaryError } =
    useGetAnalyticsSummary({ query: { queryKey: ["analytics-summary"] } })
  const { data: dailyAnalytics, isLoading: isLoadingDaily, isError: isDailyError } =
    useGetDailyAnalytics(dateRange, {
      query: { queryKey: ["daily-analytics", dateRange.startDate, dateRange.endDate] },
    })
  const { data: fleet, isError: isFleetError } = useLiveDrivers({ pollMs: 30_000 })

  const chartData = (dailyAnalytics?.dailyTrips ?? []).map((day) => ({
    date: new Date(`${day.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
    trips: Number(day.tripCount),
    revenue: Number(day.totalFareCollected),
  }))
  const activeDrivers = fleet?.drivers.filter((driver) => driver.status !== "offline").length ?? 0
  const totalDrivers = summary?.users.drivers ?? 0
  const fleetShare = totalDrivers > 0 ? Math.round((activeDrivers / totalDrivers) * 100) : 0
  const loading = isLoadingSummary || isLoadingDaily
  const hasError = isSummaryError || isDailyError || isFleetError

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-muted-foreground">Live control center for Apayao fleet operations.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 shadow-sm">
          <MapPin className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">Pudtol, Apayao service area</span>
        </div>
      </div>

      {hasError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Some live metrics could not be loaded. Values are never replaced with demo data; check the API connection.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Trips" value={loading ? "—" : String(summary?.trips.inProgress ?? 0)} note="Currently in progress" icon={Activity} iconClass="bg-primary/10 text-primary" />
        <MetricCard label="Completed Revenue" value={loading ? "—" : formatPHP(Number(summary?.trips.totalRevenue ?? 0))} note="All recorded completed trips" icon={Wallet} iconClass="bg-emerald-500/10 text-emerald-600" />
        <MetricCard label="Active Drivers" value={fleet ? `${activeDrivers}/${totalDrivers}` : "—"} note={`${fleetShare}% of registered drivers online or on trip`} icon={CarFront} iconClass="bg-blue-500/10 text-blue-600" />
        <MetricCard label="Open Incidents" value={loading ? "—" : String(summary?.incidents.open ?? 0)} note={`${summary?.incidents.accidents ?? 0} accidents · ${summary?.incidents.floods ?? 0} floods`} icon={AlertTriangle} iconClass="bg-destructive/15 text-destructive" className="border-destructive/40 bg-destructive/5" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Trip Volume</CardTitle>
            <CardDescription>Actual trips recorded during the last seven days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {chartData.length === 0 && !isLoadingDaily ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No trips were recorded during this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTrips" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} dy={10} />
                    <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }} />
                    <Area type="monotone" dataKey="trips" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorTrips)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational Snapshot</CardTitle>
            <CardDescription>Current values from the live API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SnapshotRow icon={CheckCircle2} label="Completed trips" value={summary?.trips.completed ?? 0} />
            <SnapshotRow icon={Users} label="Registered passengers" value={summary?.users.passengers ?? 0} />
            <SnapshotRow icon={CarFront} label="Registered drivers" value={totalDrivers} />
            <SnapshotRow icon={AlertTriangle} label="Total incidents" value={summary?.incidents.total ?? 0} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({ label, value, note, icon: Icon, iconClass, className = "" }: { label: string; value: string; note: string; icon: typeof Activity; iconClass: string; className?: string }) {
  return (
    <Card className={`transition-shadow hover:shadow-md ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${iconClass}`}><Icon className="h-4 w-4" /></div>
      </CardHeader>
      <CardContent><div className="text-3xl font-bold">{value}</div><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent>
    </Card>
  )
}

function SnapshotRow({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3"><Icon className="h-4 w-4 text-primary" /><span className="text-sm text-muted-foreground">{label}</span></div>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}
