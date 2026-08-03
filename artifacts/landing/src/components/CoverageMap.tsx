import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { routeStrip, loopGeometry } from '@/content/site';

/**
 * Coverage map — free OpenStreetMap tiles via Leaflet, the same stack the
 * admin dashboard's fleet map uses. No Google Maps billing on the public site.
 *
 * Shows the loop's stops and the line between them so a visitor can see the
 * actual geography rather than only the abstract route diagram. The stop
 * coordinates live in content/site.ts alongside the stop names, so both are
 * updated in one place when the real loop data lands.
 */

const stopIcon = (terminus: boolean) =>
  L.divIcon({
    className: 'coverage-stop',
    html: `<div style="
      width:${terminus ? 18 : 13}px;height:${terminus ? 18 : 13}px;
      border-radius:50%;
      background:${terminus ? '#ee4b1e' : '#ffffff'};
      border:3px solid ${terminus ? '#ffffff' : '#ee4b1e'};
      box-shadow:0 1px 5px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [terminus ? 18 : 13, terminus ? 18 : 13],
    iconAnchor: [terminus ? 9 : 7, terminus ? 9 : 7],
  });

export function CoverageMap() {
  const pts = loopGeometry.stops;
  const line: [number, number][] = pts.map((s) => [s.lat, s.lon]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <MapContainer
        center={loopGeometry.center}
        zoom={loopGeometry.zoom}
        scrollWheelZoom={false}
        style={{ height: 340, width: '100%' }}
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={line} pathOptions={{ color: '#ee4b1e', weight: 4, opacity: 0.8 }} />
        {pts.map((s, i) => (
          <Marker
            key={s.name}
            position={[s.lat, s.lon]}
            icon={stopIcon(i === 0 || i === pts.length - 1)}
          >
            <Popup>
              <strong>{s.name}</strong>
              <br />
              <span style={{ fontSize: 12, color: '#555' }}>
                {routeStrip.code} · {routeStrip.name}
              </span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
