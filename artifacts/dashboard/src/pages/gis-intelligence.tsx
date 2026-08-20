import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { APIProvider, Map as GoogleMap, Polyline, useMap } from "@vis.gl/react-google-maps"
import { customFetch } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { googleMapsBrowserKey } from "@/lib/google-maps"
import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  MapPinned,
  Network,
  RadioTower,
  RefreshCw,
  Route,
  Satellite,
  ShieldCheck,
  XCircle,
} from "lucide-react"

interface GisOverview {
  totalPoints: number
  points24h: number
  activeDrivers24h: number
  validPoints: number
  mockedPoints: number
  lowAccuracyPoints: number
  averageAccuracyM: number | null
  latestPointAt: string | null
  qualityScore: number
  totalCandidates: number
  draftCandidates: number
  approvedCandidates: number
  generatedAt: string
}

interface GisTrackFeature {
  geometry: { type: "LineString"; coordinates: number[][] }
  properties: {
    driverId: string
    driverName: string | null
    tripId: number | null
    pointCount: number
    startedAt: string
    endedAt: string
  }
}

interface GisTrackCollection {
  type: "FeatureCollection"
  features: GisTrackFeature[]
  generatedAt: string
}

type CandidateStatus = "draft" | "reviewing" | "approved" | "rejected"

interface GisCandidate {
  id: number
  name: string
  status: CandidateStatus
  geometryGeoJson: { type: "LineString"; coordinates: number[][] }
  supportingRuns: number
  supportingDrivers: number
  confidence: number
  distanceKm: number | null
  sourceWindowStart: string | null
  sourceWindowEnd: string | null
  reviewedAt: string | null
  reviewReason: string | null
}

interface GisCandidateList {
  candidates: GisCandidate[]
}

const TRACK_COLORS = ["#22c55e", "#38bdf8", "#fb923c", "#a78bfa", "#fb7185", "#2dd4bf"]
const TIME_RANGES = [
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" },
  { hours: 72, label: "3d" },
  { hours: 168, label: "7d" },
]

function FitMapGeometry({ paths }: { paths: number[][][] }) {
  const map = useMap()
  const revision = paths.map((path) => path.map((point) => point.join(",")).join(";")).join("|")
  useEffect(() => {
    if (!map) return
    const points = paths.flat()
    if (points.length === 0) return
    map.fitBounds({
      north: Math.max(...points.map((point) => point[1]!)),
      south: Math.min(...points.map((point) => point[1]!)),
      east: Math.max(...points.map((point) => point[0]!)),
      west: Math.min(...points.map((point) => point[0]!)),
    }, 54)
    // revision is a stable geometry signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, revision])
  return null
}

function statusBadge(status: CandidateStatus) {
  if (status === "approved") return "border-emerald-300 bg-emerald-50 text-emerald-800"
  if (status === "rejected") return "border-rose-300 bg-rose-50 text-rose-800"
  if (status === "reviewing") return "border-amber-300 bg-amber-50 text-amber-800"
  return "border-violet-300 bg-violet-50 text-violet-800"
}

function formatMoment(value: string | null) {
  if (!value) return "No GPS received"
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function GisIntelligence() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [hours, setHours] = useState(24)
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null)
  const [reviewReason, setReviewReason] = useState("")

  const overview = useQuery({
    queryKey: ["gis-overview"],
    queryFn: () => customFetch<GisOverview>("/api/admin/gis/overview"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
  const tracks = useQuery({
    queryKey: ["gis-recent-tracks", hours],
    queryFn: () => customFetch<GisTrackCollection>(`/api/admin/gis/tracks/recent?hours=${hours}&limit=100`),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
  const candidates = useQuery({
    queryKey: ["gis-candidates"],
    queryFn: () => customFetch<GisCandidateList>("/api/admin/gis/candidates"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (selectedCandidateId == null && candidates.data?.candidates[0]) {
      setSelectedCandidateId(candidates.data.candidates[0].id)
    }
  }, [candidates.data?.candidates, selectedCandidateId])

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gis-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["gis-recent-tracks"] }),
      queryClient.invalidateQueries({ queryKey: ["gis-candidates"] }),
    ])
  }

  const generateCandidates = useMutation({
    mutationFn: () => customFetch<{ created: number; updated: number }>(
      "/api/admin/gis/candidates/generate",
      { method: "POST", body: JSON.stringify({ days: 30 }) },
    ),
    onSuccess: async (result) => {
      await refreshAll()
      toast({ title: "Route analysis complete", description: `${result.created} new and ${result.updated} updated candidates.` })
    },
    onError: () => toast({ title: "Analysis failed", description: "Check the GIS service and GPS history.", variant: "destructive" }),
  })

  const reviewCandidate = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Exclude<CandidateStatus, "draft"> }) =>
      customFetch(`/api/admin/gis/candidates/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason: reviewReason.trim() }),
      }),
    onSuccess: async () => {
      setReviewReason("")
      await refreshAll()
      toast({ title: "Review documented", description: "The decision was recorded in the private GIS audit stream." })
    },
    onError: () => toast({ title: "Review not saved", description: "Use a reason of at least five characters and retry.", variant: "destructive" }),
  })

  const selectedCandidate = candidates.data?.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null
  const mapPaths = useMemo(() => {
    const values = (tracks.data?.features ?? []).map((track) => track.geometry.coordinates)
    if (selectedCandidate?.geometryGeoJson.coordinates.length) values.push(selectedCandidate.geometryGeoJson.coordinates)
    return values
  }, [selectedCandidate, tracks.data?.features])
  const unavailable = overview.isError || tracks.isError || candidates.isError
  const serviceState = overview.isLoading ? "checking" : unavailable ? "offline" : "online"
  const readinessChecks = [
    { label: "PostGIS service reachable", ready: !unavailable && overview.isSuccess },
    { label: "Driver GPS is being collected", ready: (overview.data?.totalPoints ?? 0) > 0 },
    { label: "At least two contributing drivers", ready: (overview.data?.activeDrivers24h ?? 0) >= 2 },
    { label: "Review candidate available", ready: (overview.data?.totalCandidates ?? 0) > 0 },
  ]
  const readiness = readinessChecks.filter((check) => check.ready).length * 25
  const stats = [
    { label: "GPS observations", value: overview.data?.totalPoints ?? 0, detail: `${overview.data?.validPoints ?? 0} quality-approved`, icon: Database },
    { label: "Active contributors", value: overview.data?.activeDrivers24h ?? 0, detail: `Latest: ${formatMoment(overview.data?.latestPointAt ?? null)}`, icon: RadioTower },
    { label: "Route candidates", value: overview.data?.totalCandidates ?? 0, detail: `${overview.data?.approvedCandidates ?? 0} GIS-approved`, icon: Route },
    { label: "Data quality", value: `${overview.data?.qualityScore ?? 0}%`, detail: overview.data?.averageAccuracyM == null ? "Awaiting accuracy data" : `${overview.data.averageAccuracyM.toFixed(1)} m average accuracy`, icon: Activity },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="gap-1 bg-violet-600 text-white hover:bg-violet-600"><ShieldCheck className="h-3.5 w-3.5" /> Restricted system</Badge>
            <Badge variant="outline">Developer / Superadmin</Badge>
            <Badge className={serviceState === "online" ? "bg-emerald-100 text-emerald-800" : serviceState === "offline" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}>{serviceState === "online" ? "PostGIS online" : serviceState === "offline" ? "Service offline" : "Checking service"}</Badge>
          </div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight"><Network className="h-8 w-8 text-violet-600" /> GIS Intelligence</h1>
          <p className="mt-1 text-sm text-muted-foreground">Private route evidence, spatial quality control, and documented GIS decisions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refreshAll()}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
          <Button onClick={() => generateCandidates.mutate()} disabled={generateCandidates.isPending || unavailable} className="bg-violet-600 text-white hover:bg-violet-700">
            <Route className="mr-2 h-4 w-4" />{generateCandidates.isPending ? "Analyzing…" : "Analyze 30-day routes"}
          </Button>
        </div>
      </div>

      {unavailable && (
        <Card className="border-amber-300 bg-amber-50 text-amber-950">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>The private service is not running. Start it locally; the API and GIS service now share the existing JWT secret only in development.</span>
            <code className="rounded bg-amber-100 px-3 py-2 font-semibold">pnpm --filter @workspace/gis-service run dev</code>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, detail, icon: Icon }) => (
          <Card key={label}><CardContent className="flex items-center gap-4 p-5"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700"><Icon className="h-5 w-5" /></span><div className="min-w-0"><div className="text-2xl font-bold tabular-nums">{overview.isLoading ? <Skeleton className="h-7 w-12" /> : typeof value === "number" ? value.toLocaleString() : value}</div><div className="text-sm font-medium">{label}</div><div className="truncate text-xs text-muted-foreground">{detail}</div></div></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Satellite className="h-5 w-5 text-violet-600" /> Spatial evidence map</CardTitle><p className="mt-1 text-sm text-muted-foreground">Satellite streets, cleaned driver traces, and the selected candidate.</p></div><div className="flex gap-1 rounded-lg border bg-muted/30 p-1">{TIME_RANGES.map((range) => <button key={range.hours} onClick={() => setHours(range.hours)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${hours === range.hours ? "bg-background text-violet-700 shadow-sm" : "text-muted-foreground"}`}>{range.label}</button>)}</div></div></CardHeader>
          <div className="relative h-[560px]">
            {googleMapsBrowserKey ? (
              <APIProvider apiKey={googleMapsBrowserKey} language="en" region="PH">
                <GoogleMap defaultCenter={{ lat: 18.28, lng: 121.37 }} defaultZoom={11} gestureHandling="greedy" mapTypeId="hybrid" mapTypeControl streetViewControl fullscreenControl scaleControl reuseMaps>
                  <FitMapGeometry paths={mapPaths} />
                  {(tracks.data?.features ?? []).map((track, index) => <Polyline key={`${track.properties.driverId}:${track.properties.tripId ?? "shift"}:${track.properties.endedAt}`} path={track.geometry.coordinates.map(([lon, lat]) => ({ lat: lat!, lng: lon! }))} strokeColor={TRACK_COLORS[index % TRACK_COLORS.length]} strokeOpacity={0.8} strokeWeight={4} />)}
                  {selectedCandidate && <Polyline path={selectedCandidate.geometryGeoJson.coordinates.map(([lon, lat]) => ({ lat: lat!, lng: lon! }))} strokeColor="#e879f9" strokeOpacity={0.95} strokeWeight={8} />}
                </GoogleMap>
              </APIProvider>
            ) : (
              <div className="flex h-full items-center justify-center bg-muted/30 text-center"><div><MapPinned className="mx-auto h-9 w-9 text-violet-600" /><p className="mt-3 font-medium">Google Maps browser key required</p><p className="text-sm text-muted-foreground">GIS data stays protected; the key enables only its visualization.</p></div></div>
            )}
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur"><span className="mr-3 inline-flex items-center gap-1"><i className="h-1 w-5 rounded bg-cyan-400" /> Driver trace</span><span className="inline-flex items-center gap-1"><i className="h-1.5 w-5 rounded bg-fuchsia-400" /> Selected candidate</span></div>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Operational readiness</CardTitle><p className="text-sm text-muted-foreground">What the route-learning pipeline has available now.</p></CardHeader>
          <CardContent className="space-y-4">
            <div><div className="mb-2 flex justify-between text-sm font-medium"><span>Pipeline readiness</span><span>{readiness}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${readiness}%` }} /></div></div>
            <div className="space-y-3">{readinessChecks.map((check) => <div key={check.label} className="flex items-center gap-2 text-sm">{check.ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}<span className={check.ready ? "" : "text-muted-foreground"}>{check.label}</span></div>)}</div>
            {(overview.data?.totalPoints ?? 0) === 0 && !unavailable && <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm"><p className="font-medium">Waiting for real driver GPS</p><p className="mt-1 text-muted-foreground">Open the driver app, allow precise/background location, and go online. Points are recorded automatically while location updates reach the API.</p></div>}
            <div className="rounded-xl bg-violet-50 p-4 text-xs text-violet-950"><strong>Safety boundary:</strong> GIS approval records evidence only. It cannot publish or replace the passenger-facing loop.</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Candidate review desk</CardTitle><p className="text-sm text-muted-foreground">Every approval or rejection requires a written reason and is written to the private GIS audit stream.</p></CardHeader>
        <CardContent>
          {(candidates.data?.candidates.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center"><Route className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No corridor has reached the evidence threshold</p><p className="mt-1 text-sm text-muted-foreground">A candidate needs at least three valid runs from two drivers.</p></div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
              <div className="grid gap-3 sm:grid-cols-2">{candidates.data!.candidates.map((candidate) => <button key={candidate.id} onClick={() => { setSelectedCandidateId(candidate.id); setReviewReason("") }} className={`rounded-xl border p-4 text-left transition ${selectedCandidateId === candidate.id ? "border-violet-500 ring-2 ring-violet-500/15" : "hover:border-violet-300"}`}><div className="flex items-start justify-between gap-2"><span className="font-medium">{candidate.name}</span><Badge variant="outline" className={statusBadge(candidate.status)}>{candidate.status}</Badge></div><p className="mt-3 text-xs text-muted-foreground">{candidate.supportingRuns} runs · {candidate.supportingDrivers} drivers · {candidate.distanceKm?.toFixed(1) ?? "—"} km</p><div className="mt-2 h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-violet-500" style={{ width: `${Math.round(candidate.confidence * 100)}%` }} /></div><p className="mt-1 text-xs font-medium text-violet-700">{Math.round(candidate.confidence * 100)}% evidence confidence</p></button>)}</div>
              <div className="rounded-xl border bg-muted/15 p-5">
                {selectedCandidate ? <><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{selectedCandidate.name}</p><p className="text-xs text-muted-foreground">Candidate #{selectedCandidate.id}</p></div><Badge variant="outline" className={statusBadge(selectedCandidate.status)}>{selectedCandidate.status}</Badge></div>{selectedCandidate.reviewReason && <div className="mt-4 rounded-lg border bg-background p-3 text-sm"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Documented reason</p><p className="mt-1">{selectedCandidate.reviewReason}</p></div>}{selectedCandidate.status === "draft" || selectedCandidate.status === "reviewing" ? <><Textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Document the evidence and reason for this decision…" className="mt-4 min-h-28" maxLength={500} /><div className="mt-3 grid grid-cols-3 gap-2"><Button variant="outline" disabled={reviewReason.trim().length < 5 || reviewCandidate.isPending} onClick={() => reviewCandidate.mutate({ id: selectedCandidate.id, status: "reviewing" })}><Clock3 className="mr-1 h-4 w-4" /> Review</Button><Button disabled={reviewReason.trim().length < 5 || reviewCandidate.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => reviewCandidate.mutate({ id: selectedCandidate.id, status: "approved" })}><CheckCircle2 className="mr-1 h-4 w-4" /> Approve</Button><Button variant="destructive" disabled={reviewReason.trim().length < 5 || reviewCandidate.isPending} onClick={() => reviewCandidate.mutate({ id: selectedCandidate.id, status: "rejected" })}><XCircle className="mr-1 h-4 w-4" /> Reject</Button></div></> : <p className="mt-4 text-sm text-muted-foreground">This candidate has a final GIS decision. It remains separate from operational route publishing.</p>}</> : <p className="text-sm text-muted-foreground">Select a candidate to inspect and review it.</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
