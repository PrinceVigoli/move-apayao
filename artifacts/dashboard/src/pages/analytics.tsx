import React, { useMemo, useState } from "react"
import { useGetAnalyticsSummary, useGetDailyAnalytics } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatPHP } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, Legend, PieChart, Pie, Cell
} from "recharts"
import { Calendar, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

const RANGE_OPTIONS = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 14 Days", days: 14 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
]

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rangeFromDays(days: number): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (days - 1))
  return { startDate: toISODate(start), endDate: toISODate(end) }
}

export default function Analytics() {
  const [rangeDays, setRangeDays] = useState(14)
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)

  const { startDate, endDate } = useMemo(() => rangeFromDays(rangeDays), [rangeDays])

  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary({
    query: { queryKey: ["analytics-summary"] },
  })

  const { data: dailyAnalytics, isLoading: isLoadingDaily } = useGetDailyAnalytics(
    { startDate, endDate },
    { query: { queryKey: ["daily-analytics", startDate, endDate] } },
  )

  // Shape the real daily rows for the charts. The API returns one row per day
  // that had trips, so we map straight through and format the date label.
  const dailyData = useMemo(() => {
    const rows = dailyAnalytics?.dailyTrips ?? []
    return rows.map((r) => ({
      date: new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      rawDate: r.date,
      trips: r.tripCount,
      completed: r.completedCount,
      cancelled: r.cancelledCount,
      passengers: r.uniquePassengers,
      revenue: r.totalFareCollected,
      avgDuration: Math.round(r.avgTripDurationMinutes),
    }))
  }, [dailyAnalytics])

  // Real status breakdown from the system-wide summary.
  const statusBreakdown = useMemo(() => {
    const t = summary?.trips
    if (!t) return []
    return [
      { name: "Completed", value: t.completed, color: "hsl(var(--primary))" },
      { name: "Cancelled", value: t.cancelled, color: "hsl(var(--destructive))" },
      { name: "In Progress", value: t.inProgress, color: "hsl(var(--accent))" },
    ].filter((s) => s.value > 0)
  }, [summary])

  const totalTripsInRange = dailyData.reduce((sum, d) => sum + d.trips, 0)
  const totalRevenueInRange = dailyData.reduce((sum, d) => sum + d.revenue, 0)

  const handleExportCsv = () => {
    const header = [
      "Date",
      "Trips",
      "Completed",
      "Cancelled",
      "Unique Passengers",
      "Revenue (PHP)",
      "Avg Duration (min)",
    ]
    const lines = dailyData.map((d) =>
      [d.rawDate, d.trips, d.completed, d.cancelled, d.passengers, d.revenue, d.avgDuration].join(","),
    )
    const csv = [header.join(","), ...lines].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `move-apayao-analytics_${startDate}_to_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            System performance and fleet efficiency metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="outline" className="gap-2" onClick={() => setRangeMenuOpen((o) => !o)}>
              <Calendar className="h-4 w-4" />
              {RANGE_OPTIONS.find((r) => r.days === rangeDays)?.label ?? "Range"}
            </Button>
            {rangeMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-md border bg-popover shadow-md z-10 p-1">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    className="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      setRangeDays(opt.days)
                      setRangeMenuOpen(false)
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button className="gap-2" onClick={handleExportCsv} disabled={dailyData.length === 0}>
            <FileDown className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Range summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Trips in range</p>
            <p className="text-2xl font-bold">
              {isLoadingDaily ? <Skeleton className="h-8 w-16" /> : totalTripsInRange.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Revenue in range</p>
            <p className="text-2xl font-bold">
              {isLoadingDaily ? <Skeleton className="h-8 w-24" /> : formatPHP(totalRevenueInRange)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total completed</p>
            <p className="text-2xl font-bold">
              {isLoadingSummary ? <Skeleton className="h-8 w-16" /> : (summary?.trips.completed ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Lifetime revenue</p>
            <p className="text-2xl font-bold">
              {isLoadingSummary ? <Skeleton className="h-8 w-24" /> : formatPHP(summary?.trips.totalRevenue ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Revenue & Volume</CardTitle>
            <CardDescription>Correlation between trips and earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              {isLoadingDaily ? (
                <Skeleton className="h-full w-full" />
              ) : dailyData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No trip data in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      tickFormatter={(val) => `₱${val / 1000}k`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    />
                    <Legend />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue (₱)"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      fill="url(#colorRevenue)"
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="trips"
                      name="Trips"
                      stroke="hsl(var(--accent))"
                      strokeWidth={2}
                      fillOpacity={0}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trip Status Breakdown</CardTitle>
            <CardDescription>All-time completion rate</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[250px] w-full">
              {isLoadingSummary ? (
                <Skeleton className="h-full w-full" />
              ) : statusBreakdown.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No trips yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(value: number) => [value.toLocaleString(), "Trips"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {statusBreakdown.length > 0 && (
              <div className="flex gap-4 mt-4 text-sm w-full justify-center flex-wrap">
                {statusBreakdown.map((status) => (
                  <div key={status.name} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
                    <span className="text-muted-foreground">{status.name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Completed vs Cancelled Trips</CardTitle>
            <CardDescription>Daily reliability over the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              {isLoadingDaily ? (
                <Skeleton className="h-full w-full" />
              ) : dailyData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  No trip data in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    />
                    <Legend />
                    <Bar dataKey="completed" name="Completed" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} barSize={24} />
                    <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}