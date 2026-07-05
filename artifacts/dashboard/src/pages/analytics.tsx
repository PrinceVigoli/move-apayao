import React, { useState } from "react"
import { useGetAnalyticsSummary, useGetDailyAnalytics } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { formatPHP } from "@/lib/utils"
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, Legend, PieChart, Pie, Cell
} from "recharts"
import { Calendar, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Analytics() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalyticsSummary({
    query: {
      queryKey: ["analytics-summary"]
    }
  })

  const { data: dailyAnalytics, isLoading: isLoadingDaily } = useGetDailyAnalytics(
    { startDate: "2023-01-01", endDate: "2023-01-30" }, 
    { query: { queryKey: ["daily-analytics"] } }
  )

  // Mock data for rich visualizations
  const mockDailyData = [
    { date: "Oct 1", trips: 145, cancelled: 12, revenue: 15400 },
    { date: "Oct 2", trips: 152, cancelled: 8, revenue: 16800 },
    { date: "Oct 3", trips: 138, cancelled: 15, revenue: 14400 },
    { date: "Oct 4", trips: 170, cancelled: 5, revenue: 19100 },
    { date: "Oct 5", trips: 165, cancelled: 9, revenue: 18800 },
    { date: "Oct 6", trips: 185, cancelled: 4, revenue: 21200 },
    { date: "Oct 7", trips: 192, cancelled: 7, revenue: 22800 },
    { date: "Oct 8", trips: 160, cancelled: 11, revenue: 18500 },
    { date: "Oct 9", trips: 175, cancelled: 6, revenue: 19900 },
    { date: "Oct 10", trips: 182, cancelled: 8, revenue: 20500 },
    { date: "Oct 11", trips: 205, cancelled: 5, revenue: 24100 },
    { date: "Oct 12", trips: 210, cancelled: 10, revenue: 24800 },
    { date: "Oct 13", trips: 230, cancelled: 14, revenue: 27500 },
    { date: "Oct 14", trips: 215, cancelled: 9, revenue: 25200 },
  ]

  const driverEarningsData = [
    { name: "Juan D.", earnings: 8500, trips: 142 },
    { name: "Maria S.", earnings: 7200, trips: 118 },
    { name: "Pedro P.", earnings: 6800, trips: 105 },
    { name: "Leni R.", earnings: 6100, trips: 95 },
    { name: "Carlos M.", earnings: 5900, trips: 88 },
  ]

  const statusBreakdown = [
    { name: "Completed", value: 85, color: "hsl(var(--primary))" },
    { name: "Cancelled", value: 10, color: "hsl(var(--destructive))" },
    { name: "In Progress", value: 5, color: "hsl(var(--accent))" },
  ]

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
          <Button variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" />
            Last 14 Days
          </Button>
          <Button className="gap-2">
            <FileDown className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Revenue & Volume</CardTitle>
            <CardDescription>Correlation between trips and earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockDailyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
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
                    yAxisId="left"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(val) => `₱${val/1000}k`}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trip Status Breakdown</CardTitle>
            <CardDescription>Overall completion rate</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[250px] w-full">
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
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value) => [`${value}%`, 'Share']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-4 text-sm w-full justify-center">
              {statusBreakdown.map((status) => (
                <div key={status.name} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
                  <span className="text-muted-foreground">{status.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Top Earning Drivers</CardTitle>
            <CardDescription>Highest grossing operators in period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={driverEarningsData} layout="vertical" margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    type="number" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                    tickFormatter={(val) => `₱${val}`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--foreground))', fontSize: 13, fontWeight: 500 }}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="earnings" name="Total Earnings" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
