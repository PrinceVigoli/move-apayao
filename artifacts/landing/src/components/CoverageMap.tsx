import { useEffect, useMemo } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  Marker as GoogleMarker,
  Polyline as GooglePolyline,
  useMap,
} from "@vis.gl/react-google-maps";
import { KeyRound, MapPinned } from "lucide-react";
import { decodeGooglePolyline, type FeaturedLoop } from "@/lib/loops";

const browserMapsKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY?.trim();

function stopMarkerIcon(index: number, total: number) {
  const isTerminus = index === 0 || index === total - 1;
  const fill = isTerminus ? "#145c3b" : "#ffffff";
  const text = isTerminus ? "#ffffff" : "#145c3b";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="44" viewBox="0 0 38 44"><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-opacity=".28"/></filter><path filter="url(#s)" d="M19 42C14.5 35.5 4 26 4 17a15 15 0 1 1 30 0c0 9-10.5 18.5-15 25Z" fill="${fill}" stroke="#b8ed50" stroke-width="3"/><circle cx="19" cy="17" r="7.5" fill="${isTerminus ? "#145c3b" : "#eef7e8"}"/><text x="19" y="21" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="${text}">${index + 1}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function FitGoogleRoute({
  path,
}: {
  path: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || path.length === 0) return;
    const latitudes = path.map((point) => point.lat);
    const longitudes = path.map((point) => point.lng);
    map.fitBounds(
      {
        north: Math.max(...latitudes),
        south: Math.min(...latitudes),
        east: Math.max(...longitudes),
        west: Math.min(...longitudes),
      },
      42,
    );
  }, [map, path]);
  return null;
}

export function CoverageMap({ loop }: { loop: FeaturedLoop | null }) {
  const stops = useMemo(
    () => [...(loop?.stops ?? [])].sort((a, b) => a.sequence - b.sequence),
    [loop?.stops],
  );
  const enteredStopPath = useMemo(
    () => stops.map((stop) => ({ lat: stop.lat, lng: stop.lon })),
    [stops],
  );
  const googleRoutePath = useMemo(
    () =>
      loop?.route.routePolyline
        ? decodeGooglePolyline(loop.route.routePolyline)
        : enteredStopPath,
    [enteredStopPath, loop?.route.routePolyline],
  );
  const isClosedLoop =
    stops.length > 2 &&
    Math.abs(stops[0]!.lat - stops[stops.length - 1]!.lat) < 0.00001 &&
    Math.abs(stops[0]!.lon - stops[stops.length - 1]!.lon) < 0.00001;
  const visibleMarkers = isClosedLoop ? stops.slice(0, -1) : stops;

  if (!loop || stops.length < 2) {
    return (
      <div className="flex h-[390px] items-center justify-center bg-muted px-6 text-center text-sm text-muted-foreground">
        No published loop geometry is available yet. Add the real ordered stops
        in the admin dashboard.
      </div>
    );
  }

  if (browserMapsKey) {
    return (
      <div className="coverage-map relative h-[310px] overflow-hidden sm:h-[390px]">
        <APIProvider apiKey={browserMapsKey} language="en" region="PH">
          <GoogleMap
            defaultCenter={googleRoutePath[0] ?? { lat: 18.3, lng: 121.2 }}
            defaultZoom={13}
            gestureHandling="cooperative"
            disableDefaultUI={false}
            mapTypeId="hybrid"
            zoomControl
            mapTypeControl
            streetViewControl
            fullscreenControl
            scaleControl
            clickableIcons
          >
            <FitGoogleRoute path={googleRoutePath} />
            <GooglePolyline
              path={googleRoutePath}
              strokeColor="#1B5E3A"
              strokeWeight={6}
              strokeOpacity={0.9}
            />
            {visibleMarkers.map((stop, index) => (
              <GoogleMarker
                key={stop.id}
                position={{ lat: stop.lat, lng: stop.lon }}
                title={`${index + 1}. ${stop.name}${isClosedLoop && index === 0 ? " (start and return)" : ""}`}
                icon={stopMarkerIcon(index, stops.length)}
              />
            ))}
          </GoogleMap>
        </APIProvider>
      </div>
    );
  }

  return (
    <div className="coverage-map relative flex h-[310px] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#e7f5ee,#f7faf8_62%)] p-6 text-center sm:h-[390px] sm:p-8">
      <div className="max-w-sm rounded-2xl border border-primary/10 bg-background/95 p-6 shadow-xl">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <MapPinned className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-lg font-bold">
          Detailed Google map awaiting key
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Add the restricted Maps JavaScript API browser key and restart the
          landing page. Leaflet is no longer used.
        </p>
        <code className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-[11px]">
          <KeyRound className="h-3.5 w-3.5" /> VITE_GOOGLE_MAPS_BROWSER_API_KEY
        </code>
      </div>
    </div>
  );
}
