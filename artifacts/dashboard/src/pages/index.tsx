import React from "react"
import { useGetAnalyticsSummary, useGetDailyAnalytics } from "@workspace/api-client-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatPHP } from "@/lib/utils"
import { 
  Activity, 
  Map, 
  Users, 
  CarFront, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp,
  Clock,
  CloudSun,
  Wallet
} from "lucide-react"
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts"

export default function Overview() {
  // We don't have real dates right now without an API, but we pass valid params
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary({
    query: {
      queryKey: ["analytics-summary"]
    }
  })

  const { data: dailyAnalytics, isLoading: isLoadingDaily } = useGetDailyAnalytics(
    { startDate: "2023-01-01", endDate: "2023-01-30" }, // Mock dates
    {
      query: {
        queryKey: ["daily-analytics"]
      }
    }
  )

  // Mock data for initial render until API connects
  const mockSummary = summary || {
    trips: { total: 1245, completed: 1100, cancelled: 45, inProgress: 100, totalRevenue: 85400 },
    users: { totalUsers: 3500, passengers: 3200, drivers: 280, admins: 20 },
    incidents: { total: 15, open: 3, accidents: 1, floods: 2 }
  }

  const mockChartData = [
    { date: "Jan 1", trips: 45, revenue: 3200 },
    { date: "Jan 2", trips: 52, revenue: 3800 },
    { date: "Jan 3", trips: 48, revenue: 3400 },
    { date: "Jan 4", trips: 70, revenue: 5100 },
    { date: "Jan 5", trips: 65, revenue: 4800 },
    { date: "Jan 6", trips: 85, revenue: 6200 },
    { date: "Jan 7", trips: 92, revenue: 6800 },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">
            Real-time control center for Apayao fleet operations.
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-card border px-4 py-2 rounded-full shadow-sm">
          <CloudSun className="text-amber-500 h-5 w-5" />
          <div className="text-sm font-medium">Luna, Apayao</div>
          <div className="text-sm text-muted-foreground ml-2">28°C</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Trips</CardTitle>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Activity className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{mockSummary.trips.inProgress}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-emerald-500 flex items-center"><TrendingUp className="w-3 h-3 mr-1" />+12%</span> from last hour
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Revenue</CardTitle>
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Wallet className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatPHP(mockSummary.trips.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-emerald-500 flex items-center"><TrendingUp className="w-3 h-3 mr-1" />+4.5%</span> from yesterday
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Drivers</CardTitle>
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <CarFront className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">142<span className="text-muted-foreground text-lg font-normal">/{mockSummary.users.drivers}</span></div>
            <p className="text-xs text-muted-foreground mt-1">
              51% of fleet online
            </p>
          </CardContent>
        </Card>

        <Card className="border-destructive/50 bg-destructive/5 hover-elevate transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Open Incidents</CardTitle>
            <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center text-destructive">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{mockSummary.incidents.open}</div>
            <p className="text-xs text-destructive/80 mt-1 flex items-center gap-1">
              {mockSummary.incidents.accidents} accidents • {mockSummary.incidents.floods} floods
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Trip Volume & Revenue</CardTitle>
            <CardDescription>7-day rolling performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTrips" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="trips" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorTrips)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Live feed from operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { type: "trip", msg: "Trip #8402 completed by Juan D.", time: "2 min ago", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                { type: "incident", msg: "New flood report in Pudtol area", time: "15 min ago", icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" },
                { type: "driver", msg: "Driver Maria S. went online", time: "28 min ago", icon: CarFront, color: "text-blue-500", bg: "bg-blue-500/10" },
                { type: "trip", msg: "High demand in Conner loop", time: "1 hr ago", icon: Activity, color: "text-primary", bg: "bg-primary/10" },
                { type: "wallet", msg: "Wallet top-up anomaly flagged", time: "2 hrs ago", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
              ].map((activity, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activity.bg} ${activity.color}`}>
                    <activity.icon className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{activity.msg}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
