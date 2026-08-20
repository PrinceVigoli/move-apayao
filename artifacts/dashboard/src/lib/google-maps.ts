export const googleMapsBrowserKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY?.trim() ?? ""

// A light, high-detail road style inspired by modern ride-hailing apps. It
// keeps local roads, barangay labels, POIs, schools, hospitals, and transit
// visible while making live vehicles and route lines easier to scan.
export const grabMapStyles = [
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f4f6f3" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e8f1e4" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e9f0e6" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#51605a" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#cfe5c8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d9ddd8" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#48534f" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f6d38b" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#e5b95f" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#d9e4dc" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#b9ddec" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#487a8e" }] },
]

export function decodeGooglePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const path: Array<{ lat: number; lng: number }> = []
  let index = 0
  let latitude = 0
  let longitude = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    latitude += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    longitude += result & 1 ? ~(result >> 1) : result >> 1
    path.push({ lat: latitude / 1e5, lng: longitude / 1e5 })
  }

  return path
}
