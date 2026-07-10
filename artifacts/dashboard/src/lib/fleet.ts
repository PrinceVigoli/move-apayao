import { useQuery } from "@tanstack/react-query"
import { customFetch } from "@workspace/api-client-react"

/**
 * Shared data layer for the admin fleet view. Backed by
 * GET /api/admin/drivers/live — every driver with last-known position,
 * computed status (on_trip / available / offline-or-stale), and their
 * active trip if any. Used by both the Fleet Map page and the Drivers page,
 * polled on an interval (dashboard-appropriate; one operator watching many
 * drivers doesn't need per-driver SSE streams the way passenger tracking
 * does).
 */

export type FleetDriverStatus = "on_trip" | "available" | "offline"

export interface FleetDriver {
  userId: string
  fullName: string | null
  phone: string | null
  vehicleType: string
  capacity: number
  plateNumber: string | null
  rating: number
  totalTrips: number
  lat: number | null
  lon: number | null
  lastLocationAt: string | null
  lastSeenSecondsAgo: number | null
  status: FleetDriverStatus
  activeTrip: { id: number; status: string; dropoffAddress: string | null } | null
}

interface LiveDriversResponse {
  drivers: FleetDriver[]
  generatedAt: string
}

export function useLiveDrivers(options?: { pollMs?: number | false }) {
  const pollMs = options?.pollMs ?? 6000
  return useQuery({
    queryKey: ["admin-drivers-live"],
    queryFn: () => customFetch<LiveDriversResponse>("/api/admin/drivers/live"),
    refetchInterval: pollMs,
  })
}

export function formatLastSeen(seconds: number | null): string {
  if (seconds == null) return "never"
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}
