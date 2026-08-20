import { useEffect, useMemo, useRef, useState } from "react"
import {
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Marker as GoogleMarker,
  useMap,
} from "@vis.gl/react-google-maps"
import { Link } from "wouter"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useLiveDrivers, formatLastSeen, type FleetDriver, type FleetDriverStatus } from "@/lib/fleet"
import { googleMapsBrowserKey } from "@/lib/google-maps"
import { Search, Truck, Star, MapPinned, KeyRound } from "lucide-react"

const DEFAULT_CENTER: [number, number] = [18.05, 121.13]
const DEFAULT_ZOOM = 10
const FLEET_REFRESH_MS = 15_000

const STATUS_META: Record<FleetDriverStatus, { color: string; label: string }> = {
  available: { color: "#10b981", label: "Available" },
  on_trip: { color: "#3b82f6", label: "On Trip" },
  offline: { color: "#9ca3af", label: "Offline" },
}

function googleDriverIcon(status: FleetDriverStatus) {
  const color = STATUS_META[status].color
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="48" viewBox="0 0 42 48"><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".28"/></filter><path filter="url(#s)" d="M21 46C16 39 5 29 5 19a16 16 0 1 1 32 0c0 10-11 20-16 27Z" fill="${color}" stroke="white" stroke-width="3"/><path d="M13 18.5h16l-2-5.5H15l-2 5.5Zm1 1.5v8m14-8v8M12 22h18v5H12z" fill="white"/><circle cx="15.5" cy="27.5" r="2" fill="#25332d"/><circle cx="26.5" cy="27.5" r="2" fill="#25332d"/></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

type Filter = "all" | FleetDriverStatus

function FitFleetBounds({ drivers }: { drivers: FleetDriver[] }) {
  const map = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (!map || drivers.length === 0 || hasFitted.current) return
    hasFitted.current = true
    const latitudes = drivers.map((driver) => driver.lat as number)
    const longitudes = drivers.map((driver) => driver.lon as number)
    map.fitBounds({
      north: Math.max(...latitudes),
      south: Math.min(...latitudes),
      east: Math.max(...longitudes),
      west: Math.min(...longitudes),
    }, 72)
    const listener = map.addListener("idle", () => {
      if ((map.getZoom() ?? DEFAULT_ZOOM) > 17) map.setZoom(17)
      listener.remove()
    })
    return () => listener.remove()
    // Camera fitting is deliberately initial-only. Live marker movement must
    // not continually pan the map or request a new set of visible tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, drivers.length])

  return null
}

export default function FleetMapPage() {
  const { data, isLoading, dataUpdatedAt } = useLiveDrivers({ pollMs: FLEET_REFRESH_MS })
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [selectedDriver, setSelectedDriver] = useState<FleetDriver | null>(null)
  const drivers = data?.drivers ?? []

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return drivers.filter((driver) => {
      if (filter !== "all" && driver.status !== filter) return false
      return !query ||
        (driver.fullName ?? "").toLowerCase().includes(query) ||
        (driver.plateNumber ?? "").toLowerCase().includes(query) ||
        driver.vehicleType.toLowerCase().includes(query)
    })
  }, [drivers, filter, search])

  const located = filtered.filter((driver) => driver.lat != null && driver.lon != null)
  const counts = useMemo(() => ({
    all: drivers.length,
    available: drivers.filter((driver) => driver.status === "available").length,
    on_trip: drivers.filter((driver) => driver.status === "on_trip").length,
    offline: drivers.filter((driver) => driver.status === "offline").length,
  }), [drivers])

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
            Live - updated <LiveClock since={dataUpdatedAt} /> - vehicle data every 15s
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["all", `All (${counts.all})`],
            ["available", `Available (${counts.available})`],
            ["on_trip", `On Trip (${counts.on_trip})`],
            ["offline", `Offline (${counts.offline})`],
          ] as [Filter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${filter === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <Card className="hidden w-80 shrink-0 flex-col md:flex">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search name or plate..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {isLoading ? (
                <><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No drivers match.</p>
              ) : filtered.map((driver) => <DriverRow key={driver.userId} driver={driver} />)}
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 flex-1 overflow-hidden">
          {googleMapsBrowserKey ? (
            <APIProvider apiKey={googleMapsBrowserKey} language="en" region="PH">
              <GoogleMap
                defaultCenter={{ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] }}
                defaultZoom={DEFAULT_ZOOM}
                gestureHandling="greedy"
                disableDefaultUI={false}
                zoomControl
                mapTypeId="roadmap"
                mapTypeControl
                streetViewControl
                fullscreenControl
                scaleControl
                clickableIcons
                reuseMaps
              >
                <FitFleetBounds drivers={located} />
                {located.map((driver) => (
                  <GoogleMarker
                    key={driver.userId}
                    position={{ lat: driver.lat as number, lng: driver.lon as number }}
                    title={driver.fullName ?? "Driver"}
                    icon={googleDriverIcon(driver.status)}
                    onClick={() => setSelectedDriver(driver)}
                  />
                ))}
                {selectedDriver?.lat != null && selectedDriver.lon != null && (
                  <InfoWindow
                    position={{ lat: selectedDriver.lat, lng: selectedDriver.lon }}
                    onCloseClick={() => setSelectedDriver(null)}
                  >
                    <DriverPopup driver={selectedDriver} />
                  </InfoWindow>
                )}
              </GoogleMap>
            </APIProvider>
          ) : (
            <MissingGoogleMap />
          )}
        </Card>
      </div>
    </div>
  )
}

function MissingGoogleMap() {
  return (
    <div className="flex h-full min-h-[420px] items-center justify-center bg-[radial-gradient(circle_at_top,#e7f5ee,#f7faf8_58%)] p-8">
      <div className="max-w-md rounded-2xl border bg-background/95 p-7 text-center shadow-xl">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
          <MapPinned className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-semibold">Google fleet map needs its browser key</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Add the restricted Maps JavaScript API key to the dashboard environment, then restart Vite. Leaflet has been removed.
        </p>
        <code className="mt-4 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <KeyRound className="h-3.5 w-3.5" /> VITE_GOOGLE_MAPS_BROWSER_API_KEY
        </code>
      </div>
    </div>
  )
}

function DriverPopup({ driver }: { driver: FleetDriver }) {
  const meta = STATUS_META[driver.status]
  return (
    <div className="min-w-44 space-y-1 text-sm">
      <div className="font-semibold">{driver.fullName ?? "Driver"}</div>
      <div className="text-xs text-gray-600">{driver.vehicleType} - {driver.plateNumber ?? "no plate"} - seats {driver.capacity}</div>
      <div className="text-xs">Status: <b style={{ color: meta.color }}>{meta.label}</b> - seen {formatLastSeen(driver.lastSeenSecondsAgo)}</div>
      <div className="text-xs text-gray-600">
        Source: {driver.locationSource === "iot_gps" ? "Vehicle IoT GPS" : driver.locationSource === "smartphone_gps" ? "Driver phone GPS" : "No GPS data"}
      </div>
      {driver.lat != null && driver.lon != null && (
        <a
          href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${driver.lat},${driver.lon}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs font-medium text-blue-600 underline"
        >
          Open street-level view
        </a>
      )}
      {driver.activeTrip && (
        <div className="text-xs">Trip #{driver.activeTrip.id} to {driver.activeTrip.dropoffAddress ?? "destination"} <Link href="/trips" className="text-blue-600 underline">view trips</Link></div>
      )}
    </div>
  )
}

function DriverRow({ driver }: { driver: FleetDriver }) {
  const meta = STATUS_META[driver.status]
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{driver.fullName ?? "Driver"}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Truck className="h-3 w-3" /><span className="truncate">{driver.vehicleType} - {driver.plateNumber ?? "no plate"}</span></div>
        <div className="text-xs text-muted-foreground">{meta.label} - seen {formatLastSeen(driver.lastSeenSecondsAgo)}</div>
        <div className="text-[11px] text-muted-foreground">
          {driver.locationSource === "iot_gps" ? "Vehicle IoT GPS" : driver.locationSource === "smartphone_gps" ? "Driver phone GPS" : "No GPS data"}
        </div>
      </div>
      <Badge variant="outline" className="shrink-0 gap-1"><Star className="h-3 w-3" /> {driver.rating.toFixed(1)}</Badge>
    </div>
  )
}

function LiveClock({ since }: { since: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => force((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000))
  return <span>{seconds}s ago</span>
}
