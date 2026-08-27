import { useMemo } from "react";
import {
  AlertTriangle,
  Check,
  MessageCircle,
  Phone,
  ShieldCheck,
  Star,
} from "lucide-react";
import { decodeGooglePolyline, useFeaturedLoop } from "@/lib/loops";

type GeoPoint = { lat: number; lng: number };
type ScreenPoint = GeoPoint & { x: number; y: number };

const fallbackStops = [
  { lat: 18.2340899, lng: 121.3670283 },
  { lat: 18.30787, lng: 121.3599783 },
  { lat: 18.3311841, lng: 121.372348 },
  { lat: 18.3321469, lng: 121.3779476 },
  { lat: 18.3161536, lng: 121.3818568 },
  { lat: 18.2340899, lng: 121.3670283 },
];

function projectRoute(path: GeoPoint[], stops: GeoPoint[]) {
  const width = 240;
  const height = 232;
  const padding = 20;
  const meanLat = path.reduce((sum, point) => sum + point.lat, 0) / path.length;
  const lonFactor = Math.cos((meanLat * Math.PI) / 180);
  const normalized = path.map((point) => ({
    ...point,
    east: point.lng * lonFactor,
    north: point.lat,
  }));
  const west = Math.min(...normalized.map((point) => point.east));
  const east = Math.max(...normalized.map((point) => point.east));
  const south = Math.min(...normalized.map((point) => point.north));
  const north = Math.max(...normalized.map((point) => point.north));
  const spanX = Math.max(east - west, 0.00001);
  const spanY = Math.max(north - south, 0.00001);
  const scale = Math.min(
    (width - padding * 2) / spanX,
    (height - padding * 2) / spanY,
  );
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const project = (point: GeoPoint): ScreenPoint => ({
    ...point,
    x: offsetX + (point.lng * lonFactor - west) * scale,
    y: height - offsetY - (point.lat - south) * scale,
  });
  return { points: path.map(project), stops: stops.map(project) };
}

export function ProductPhone() {
  const { data: loop } = useFeaturedLoop();
  const route = useMemo(() => {
    const orderedStops = loop
      ? [...loop.stops]
          .sort((a, b) => a.sequence - b.sequence)
          .map((stop) => ({ lat: stop.lat, lng: stop.lon }))
      : fallbackStops;
    const decoded = loop?.route.routePolyline
      ? decodeGooglePolyline(loop.route.routePolyline)
      : orderedStops;
    return projectRoute(
      decoded.length >= 2 ? decoded : fallbackStops,
      orderedStops,
    );
  }, [loop]);
  const routePath = route.points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
  const vehicle =
    route.points[Math.max(0, Math.floor(route.points.length * 0.32))]!;

  return (
    <div
      className="product-phone"
      aria-label="Passenger app preview showing the real Pudtol-Payanan pilot loop"
    >
      <div className="phone-speaker" aria-hidden="true" />
      <div className="phone-status" aria-hidden="true">
        <span>9:30</span>
        <span>● ◢</span>
      </div>

      <div className="phone-eta">
        <span>Driver heading to pickup</span>
        <strong>Live tracking</strong>
      </div>

      <div className="phone-map" aria-hidden="true">
        <span className="phone-map-label phone-map-label-pudtol">PUDTOL</span>
        <span className="phone-map-label phone-map-label-luna">LUNA</span>
        <svg viewBox="0 0 240 232" preserveAspectRatio="xMidYMid meet">
          <path
            d={routePath}
            fill="none"
            stroke="#fff"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
          <path
            d={routePath}
            fill="none"
            stroke="#1B5E3A"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="400"
            className="phone-route"
          />
          {route.stops.slice(0, -1).map((stop, index) => (
            <circle
              key={`${stop.lat}-${stop.lng}-${index}`}
              cx={stop.x}
              cy={stop.y}
              r={index === 0 ? 7 : 5}
              fill={index === 0 ? "#EF5335" : "#fff"}
              stroke={index === 0 ? "#fff" : "#1B5E3A"}
              strokeWidth="3"
            />
          ))}
          <circle
            cx={vehicle.x}
            cy={vehicle.y}
            r="14"
            fill="#1B5E3A"
            stroke="#fff"
            strokeWidth="4"
          />
          <path
            d={`M${vehicle.x - 5} ${vehicle.y + 4}L${vehicle.x + 7} ${vehicle.y - 7}L${vehicle.x + 3} ${vehicle.y + 7}L${vehicle.x - 1} ${vehicle.y + 2}Z`}
            fill="#fff"
          />
        </svg>
        <span className="phone-map-caption">
          Pudtol–Payanan Provincial Loop
        </span>
      </div>

      <div className="phone-driver">
        <div className="phone-avatar">JD</div>
        <div>
          <strong>Juan Dela Cruz</strong>
          <span>
            <ShieldCheck size={9} /> Verified ·{" "}
            <Star size={9} fill="currentColor" /> 4.9 · Red E-Trike
          </span>
        </div>
        <span className="phone-plate">APY-1001</span>
      </div>

      <div className="phone-progress" aria-hidden="true">
        <span className="done">
          <Check size={10} />
        </span>
        <i />
        <span className="active" />
        <i />
        <span />
      </div>
      <div className="phone-progress-labels" aria-hidden="true">
        <span>Confirmed</span>
        <span>Arriving</span>
        <span>Drop-off</span>
      </div>

      <div className="phone-route-card">
        <span className="start" />
        <strong>Poblacion, Pudtol</strong>
        <span className="end" />
        <strong>Via Payanan · Capitol · ASC · Tumog</strong>
      </div>

      <div className="phone-actions" aria-hidden="true">
        <span>
          <Phone size={11} /> Call
        </span>
        <span>
          <MessageCircle size={11} /> Message
        </span>
        <span className="danger">
          <AlertTriangle size={11} /> Emergency
        </span>
      </div>
      <div className="phone-connection">
        <i /> Vehicle GPS · live
      </div>
    </div>
  );
}
