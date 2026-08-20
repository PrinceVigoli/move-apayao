import { useCallback, useEffect, useMemo, useState } from "react"
import {
  APIProvider,
  Map as GoogleMap,
  Marker as GoogleMarker,
  Polyline as GooglePolyline,
  useMap,
} from "@vis.gl/react-google-maps"
import { previewLoopRoute, type DrivingRoute } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { decodeGooglePolyline, googleMapsBrowserKey, grabMapStyles } from "@/lib/google-maps"
import { KeyRound, Loader2, MapPinned, Undo2, Trash2 } from "lucide-react"

export interface RouteStop {
  name: string
  sequence: number
  lat: number
  lon: number
}

interface RouteMapPickerProps {
  stops: RouteStop[]
  onChange: (stops: RouteStop[]) => void
}

interface RouteStopsMapProps {
  stops: RouteStop[]
  routePolyline?: string | null
}

const DEFAULT_CENTER = { lat: 18.05, lng: 121.13 }
const DEFAULT_ZOOM = 10

function stopMarkerIcon(sequence: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="44" viewBox="0 0 38 44"><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-opacity=".28"/></filter><path filter="url(#s)" d="M19 42C14.5 35.5 4 26 4 17a15 15 0 1 1 30 0c0 9-10.5 18.5-15 25Z" fill="#f97316" stroke="white" stroke-width="3"/><circle cx="19" cy="17" r="8" fill="white"/><text x="19" y="21" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#c2410c">${sequence}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function FitGooglePath({ path }: { path: Array<{ lat: number; lng: number }> }) {
  const map = useMap()
  useEffect(() => {
    if (!map || path.length < 2) return
    const latitudes = path.map((point) => point.lat)
    const longitudes = path.map((point) => point.lng)
    map.fitBounds({
      north: Math.max(...latitudes),
      south: Math.min(...latitudes),
      east: Math.max(...longitudes),
      west: Math.min(...longitudes),
    }, 28)
  }, [map, path])
  return null
}

/** Read-only street map used by the route-detail viewer. */
export function RouteStopsMap({ stops, routePolyline }: RouteStopsMapProps) {
  const orderedStops = useMemo(
    () => [...stops].sort((a, b) => a.sequence - b.sequence),
    [stops],
  )
  const path = useMemo(
    () =>
      routePolyline
        ? decodeGooglePolyline(routePolyline)
        : orderedStops.map((stop) => ({ lat: stop.lat, lng: stop.lon })),
    [orderedStops, routePolyline],
  )

  return (
    <div className="h-[360px] overflow-hidden rounded-xl border sm:h-[440px]">
      {googleMapsBrowserKey ? (
        <APIProvider apiKey={googleMapsBrowserKey} language="en" region="PH">
          <GoogleMap
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
            gestureHandling="greedy"
            mapTypeId="roadmap"
            disableDefaultUI
            zoomControl
            fullscreenControl
            streetViewControl
            mapTypeControl
            clickableIcons
            styles={grabMapStyles}
          >
            <FitGooglePath path={path} />
            {path.length > 1 && (
              <GooglePolyline path={path} strokeColor="#f97316" strokeOpacity={0.95} strokeWeight={5} />
            )}
            {orderedStops.map((stop) => (
              <GoogleMarker
                key={`${stop.sequence}-${stop.lat}-${stop.lon}`}
                position={{ lat: stop.lat, lng: stop.lon }}
                icon={stopMarkerIcon(stop.sequence)}
                title={`${stop.sequence}. ${stop.name}`}
              />
            ))}
          </GoogleMap>
        </APIProvider>
      ) : (
        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#fff4e8,#fafafa_62%)] p-6 text-center">
          <div>
            <MapPinned className="mx-auto h-9 w-9 text-orange-500" />
            <p className="mt-3 font-semibold">Google street map unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">Set the dashboard browser key, then restart it.</p>
            <code className="mt-3 inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs"><KeyRound className="h-3 w-3" /> VITE_GOOGLE_MAPS_BROWSER_API_KEY</code>
          </div>
        </div>
      )}
    </div>
  )
}

export function RouteMapPicker({ stops, onChange }: RouteMapPickerProps) {
  const [preview, setPreview] = useState<DrivingRoute | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  const handleAddStop = useCallback(
    (lat: number, lon: number) => {
      const nextSequence = stops.length + 1
      onChange([...stops, { name: `Stop ${nextSequence}`, sequence: nextSequence, lat, lon }])
    },
    [stops, onChange],
  )

  const stopKey = stops.map((stop) => `${stop.lat.toFixed(5)},${stop.lon.toFixed(5)}`).join("|")
  useEffect(() => {
    if (stops.length < 2 || !googleMapsBrowserKey) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setIsPreviewing(true)
      previewLoopRoute(
        { stops: stops.map(({ lat, lon }) => ({ lat, lon })) },
        { signal: controller.signal },
      )
        .then((response) => setPreview(response.route))
        .catch(() => setPreview(null))
        .finally(() => setIsPreviewing(false))
    }, 500)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
    // stopKey is the stable coordinate representation for this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopKey])

  const googlePath = useMemo(
    () =>
      preview?.encodedPolyline
        ? decodeGooglePolyline(preview.encodedPolyline)
        : stops.map((stop) => ({ lat: stop.lat, lng: stop.lon })),
    [preview?.encodedPolyline, stops],
  )
  return (
    <div className="space-y-2">
      <div className="h-[250px] overflow-hidden rounded-lg border">
        {googleMapsBrowserKey ? (
          <APIProvider apiKey={googleMapsBrowserKey} language="en" region="PH">
            <GoogleMap
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={DEFAULT_ZOOM}
              gestureHandling="greedy"
              disableDefaultUI
              zoomControl
              fullscreenControl
              streetViewControl={false}
              mapTypeControl={false}
              clickableIcons
              styles={grabMapStyles}
              onClick={(event) => {
                const point = event.detail.latLng
                if (point) handleAddStop(point.lat, point.lng)
              }}
            >
              <FitGooglePath path={googlePath} />
              {googlePath.length > 1 && (
                <GooglePolyline path={googlePath} strokeColor="#f97316" strokeWeight={4} />
              )}
              {stops.map((stop) => (
                <GoogleMarker
                  key={stop.sequence}
                  position={{ lat: stop.lat, lng: stop.lon }}
                  icon={stopMarkerIcon(stop.sequence)}
                  title={stop.name}
                />
              ))}
            </GoogleMap>
          </APIProvider>
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#fff4e8,#fafafa_62%)] p-5 text-center">
            <div>
              <MapPinned className="mx-auto h-8 w-8 text-orange-500" />
              <p className="mt-2 text-sm font-medium">Google route designer unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">Add the browser key and restart the dashboard.</p>
              <code className="mt-2 inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px]"><KeyRound className="h-3 w-3" /> VITE_GOOGLE_MAPS_BROWSER_API_KEY</code>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {isPreviewing ? (
            <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Calculating road route...</span>
          ) : googleMapsBrowserKey && preview ? (
            `${preview.distanceKm.toFixed(1)} km ${preview.source === "google_routes" ? "by road" : "straight-line fallback"}`
          ) : !googleMapsBrowserKey ? (
            "Add a Google Maps browser key to preview road distance; stop order is shown for now."
          ) : stops.length === 0 ? (
            "Click the map to add your first stop."
          ) : (
            `${stops.length} stop${stops.length === 1 ? "" : "s"} added.`
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(stops.slice(0, -1))} disabled={stops.length === 0}>
            <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([])} disabled={stops.length === 0}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </div>
    </div>
  )
}
