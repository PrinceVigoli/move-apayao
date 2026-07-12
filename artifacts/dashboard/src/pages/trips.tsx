import React, { useState } from "react"
import { useListTrips } from "@workspace/api-client-react"
import { formatPHP, formatDate } from "@/lib/utils"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MapPin, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { Trip } from "@workspace/api-client-react"

export default function Trips() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  
  const { data, isLoading } = useListTrips(
    { limit: 50, offset: 0 },
    { query: { queryKey: ["list-trips", 50, 0] } }
  )

  const trips: Trip[] = data?.trips ?? []

  const filteredTrips = statusFilter === "all" ? trips : trips.filter(t => t.status === statusFilter)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge variant="success">Completed</Badge>
      case "in_progress": return <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground border-transparent">In Progress</Badge>
      case "requested": return <Badge className="bg-accent hover:bg-accent/90 text-accent-foreground border-transparent">Requested</Badge>
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trips</h1>
          <p className="text-muted-foreground mt-1">
            Monitor all passenger trips across the network.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search trip ID or address..."
                className="w-full pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary"
              />
            </div>
            <div className="w-full sm:w-[200px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[200px]">Route</TableHead>
                <TableHead>Fare / Dist</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : filteredTrips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No trips found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTrips.map((trip) => (
                  <TableRow key={trip.id} className="cursor-pointer hover:bg-muted/50 group">
                    <TableCell className="font-mono text-xs font-semibold text-muted-foreground group-hover:text-foreground">
                      #{trip.id}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(trip.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5 text-sm">
                        <div className="flex items-start gap-2">
                          <div className="w-4 flex justify-center mt-0.5">
                            <div className="w-2 h-2 rounded-full border-2 border-primary" />
                          </div>
                          <span className="truncate" title={trip.pickupAddress || ""}>{trip.pickupAddress || `${trip.pickupLat.toFixed(4)}, ${trip.pickupLon.toFixed(4)}`}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-4 flex justify-center mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-accent" />
                          </div>
                          <span className="truncate text-muted-foreground" title={trip.dropoffAddress || ""}>{trip.dropoffAddress || `${trip.dropoffLat.toFixed(4)}, ${trip.dropoffLon.toFixed(4)}`}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{trip.fareAmount ? formatPHP(trip.fareAmount) : "TBD"}</div>
                      <div className="text-xs text-muted-foreground">{trip.distanceKm ? `${trip.distanceKm.toFixed(1)} km` : "-"}</div>
                    </TableCell>
                    <TableCell>
                      {trip.driverRating != null ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600">
                          ★ {trip.driverRating}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatDate(trip.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}