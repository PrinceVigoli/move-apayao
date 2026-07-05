import { useCallback, useMemo } from "react"
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Button } from "@/components/ui/button"
import { Undo2, Trash2 } from "lucide-react"

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

// Apayao, Philippines — roughly centered on the province.
const DEFAULT_CENTER: [number, number] = [18.05, 121.13]
const DEFAULT_ZOOM = 10

function numberedIcon(n: number) {
  return L.divIcon({
    className: "route-stop-marker",
    html: `<div style="
      background:#f97316;
      color:white;
      width:26px;
      height:26px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:12px;
      font-weight:700;
      border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function ClickHandler({ onAddStop }: { onAddStop: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onAddStop(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export function RouteMapPicker({ stops, onChange }: RouteMapPickerProps) {
  const handleAddStop = useCallback(
    (lat: number, lon: number) => {
      const nextSeq = stops.length + 1
      onChange([
        ...stops,
        { name: `Stop ${nextSeq}`, sequence: nextSeq, lat, lon },
      ])
    },
    [stops, onChange],
  )

  const handleUndo = () => {
    onChange(stops.slice(0, -1))
  }

  const handleClear = () => {
    onChange([])
  }

  const polylinePositions = useMemo<[number, number][]>(
    () => stops.map((s) => [s.lat, s.lon]),
    [stops],
  )

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border h-[250px]">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onAddStop={handleAddStop} />
          {stops.map((stop) => (
            <Marker
              key={stop.sequence}
              position={[stop.lat, stop.lon]}
              icon={numberedIcon(stop.sequence)}
            />
          ))}
          {polylinePositions.length > 1 && (
            <Polyline positions={polylinePositions} pathOptions={{ color: "#f97316", weight: 3 }} />
          )}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {stops.length === 0
            ? "Click the map to add your first stop."
            : `${stops.length} stop${stops.length === 1 ? "" : "s"} added.`}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={stops.length === 0}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={stops.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      </div>
    </div>
  )
}