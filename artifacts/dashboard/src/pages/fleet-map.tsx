import { useEffect, useMemo, useState } from "react"
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Link } from "wouter"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useLiveDrivers, formatLastSeen, type FleetDriver, type FleetDriverStatus } from "@/lib/fleet"
import { Search, Truck, Star } from "lucide-react"

// Same Apayao framing the loop-route designer uses.
const DEFAULT_CENTER: [number, number] = [18.05, 121.13]
const DEFAULT_ZOOM = 10

const STATUS_META: Record<FleetDriverStatus, { color: string; label: string }> = {
  available: { color: "#10b981", label: "Available" },
  on_trip: { color: "#3b82f6", label: "On Trip" },
  offline: { color: "#9ca3af", label: "Offline" },
}

function driverIcon(status: FleetDriverStatus) {
  const { color } = STATUS_META[status]
  return L.divIcon({
    className: "fleet-driver-marker",
    html: `<div style="
      background:${color};
      width:22px;height:22px;border-radius:50%;
      border:3px solid white;
      box-shadow:0 1px 5px rgba(0,0,0,0.45);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

type Filter = "all" | FleetDriverStatus

export default function FleetMapPage() {
  const { data, isLoading, dataUpdatedAt } = useLiveDrivers()
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")

  const drivers = data?.drivers ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return drivers.filter((d) => {
      if (filter !== "all" && d.status !== filter) return false
      if (!q) return true
      return (
        (d.fullName ?? "").toLowerCase().includes(q) ||
        (d.plateNumber ?? "").toLowerCase().includes(q) ||
        d.vehicleType.toLowerCase().includes(q)
      )
    })
  }, [drivers, filter, search])

  const located = filtered.filter((d) => d.lat != null && d.lon != null)
  const counts = useMemo(
    () => ({
      all: drivers.length,
      available: drivers.filter((d) => d.status === "available").length,
      on_trip: drivers.filter((d) => d.status === "on_trip").length,
      offline: drivers.filter((d) => d.status === "offline").length,
    }),
    [drivers],
  )

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fleet Map</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live — updated <LiveClock since={dataUpdatedAt} /> · refreshes every 6s
          </p>
        </div>
        <div className="flex gap-2">
          {(
            [
              ["all", `All (${counts.all})`],
              ["available", `Available (${counts.available})`],
              ["on_trip", `On Trip (${counts.on_trip})`],
              ["offline", `Offline (${counts.offline})`],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                filter === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Sidebar list */}
        <Card className="hidden w-80 shrink-0 flex-col md:flex">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, plate…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {isLoading ? (
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No drivers match.
                </p>
              ) : (
                filtered.map((d) => <DriverRow key={d.userId} driver={d} />)
              )}
            </div>
          </CardContent>
        </Card>

        {/* Map */}
        <Card className="min-h-0 flex-1 overflow-hidden">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            className="h-full w-full"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {located.map((d) => (
              <Marker
                key={d.userId}
                position={[d.lat as number, d.lon as number]}
                icon={driverIcon(d.status)}
              >
                <Popup>
                  <div className="min-w-44 space-y-1 text-sm">
                    <div className="font-semibold">{d.fullName ?? "Driver"}</div>
                    <div className="text-xs text-gray-600">
                      {d.vehicleType} · {d.plateNumber ?? "no plate"} · seats {d.capacity}
                    </div>
                    <div className="text-xs">
                      Status: <b style={{ color: STATUS_META[d.status].color }}>{STATUS_META[d.status].label}</b>
                      {" · "}seen {formatLastSeen(d.lastSeenSecondsAgo)}
                    </div>
                    {d.activeTrip && (
                      <div className="text-xs">
                        Trip #{d.activeTrip.id} → {d.activeTrip.dropoffAddress ?? "…"}{" "}
                        <Link href="/trips" className="text-blue-600 underline">
                          view trips
                        </Link>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </Card>
      </div>
    </div>
  )
}

function DriverRow({ driver: d }: { driver: FleetDriver }) {
  const meta = STATUS_META[d.status]
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{d.fullName ?? "Driver"}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Truck className="h-3 w-3" />
          <span className="truncate">
            {d.vehicleType} · {d.plateNumber ?? "—"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {meta.label} · seen {formatLastSeen(d.lastSeenSecondsAgo)}
        </div>
      </div>
      <Badge variant="outline" className="shrink-0 gap-1">
        <Star className="h-3 w-3" /> {d.rating.toFixed(1)}
      </Badge>
    </div>
  )
}


/** Re-renders every second showing how long ago the data arrived. */
function LiveClock({ since }: { since: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.round((Date.now() - since) / 1000))
  return <span>{secs}s ago</span>
}
