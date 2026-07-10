import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Star, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Link } from "wouter"
import { useLiveDrivers, formatLastSeen, type FleetDriverStatus } from "@/lib/fleet"

const STATUS_BADGE: Record<FleetDriverStatus, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" },
  on_trip: { label: "On Trip", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  offline: { label: "Offline", className: "bg-gray-100 text-gray-600 hover:bg-gray-100" },
}

export default function Drivers() {
  // Same live feed the Fleet Map uses (GET /api/admin/drivers/live) —
  // real driver profiles, no mock data. Poll a little slower here since a
  // table doesn't need map-level freshness.
  const { data, isLoading } = useLiveDrivers({ pollMs: 15000 })
  const [search, setSearch] = useState("")

  const drivers = data?.drivers ?? []
  const q = search.trim().toLowerCase()
  const filtered = drivers.filter(
    (d) =>
      !q ||
      (d.fullName ?? "").toLowerCase().includes(q) ||
      (d.phone ?? "").toLowerCase().includes(q) ||
      (d.plateNumber ?? "").toLowerCase().includes(q) ||
      d.vehicleType.toLowerCase().includes(q),
  )

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Drivers</h1>
          <p className="text-sm text-muted-foreground">
            {drivers.length} registered driver{drivers.length === 1 ? "" : "s"} ·{" "}
            <Link href="/fleet" className="text-primary underline-offset-2 hover:underline">
              view on map
            </Link>
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, plate, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-0" />
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {drivers.length === 0
                ? "No drivers registered yet."
                : "No drivers match your search."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead className="text-center">Seats</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead className="text-center">Trips</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => {
                  const badge = STATUS_BADGE[d.status]
                  return (
                    <TableRow key={d.userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {(d.fullName ?? "D").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{d.fullName ?? "Driver"}</div>
                            <div className="text-xs text-muted-foreground">{d.phone ?? "—"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{d.vehicleType}</TableCell>
                      <TableCell>{d.plateNumber ?? "—"}</TableCell>
                      <TableCell className="text-center">{d.capacity}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {d.rating.toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">{d.totalTrips}</TableCell>
                      <TableCell>
                        <Badge className={badge.className} variant="secondary">
                          {badge.label}
                        </Badge>
                        {d.activeTrip && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Trip #{d.activeTrip.id}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {formatLastSeen(d.lastSeenSecondsAgo)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
