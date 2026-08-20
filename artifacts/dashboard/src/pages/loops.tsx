import React, { useState } from "react"
import { getGetLoopRouteQueryKey, useListLoopRoutes, useCreateLoopRoute, useGetLoopRoute } from "@workspace/api-client-react"
import { formatPHP } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Route, PlusCircle, Navigation, MapPin, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RouteMapPicker, RouteStopsMap, type RouteStop } from "@/components/route-map-picker"

export default function Loops() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [routeName, setRouteName] = useState("")
  const [baseFare, setBaseFare] = useState("40")
  const [description, setDescription] = useState("")
  const [stops, setStops] = useState<RouteStop[]>([])
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null)
  const { toast } = useToast()

  const { data, isLoading, refetch } = useListLoopRoutes({
    query: { queryKey: ["list-loop-routes"] }
  })

  const createMutation = useCreateLoopRoute()
  const routeDetail = useGetLoopRoute(
    selectedRouteId ?? 0,
    { includeRoute: true },
    {
      query: {
        queryKey: getGetLoopRouteQueryKey(selectedRouteId ?? 0, { includeRoute: true }),
        enabled: selectedRouteId !== null,
      },
    },
  )

  const routes = data?.routes ?? []
  const selectedStops: RouteStop[] = (routeDetail.data?.stops ?? []).map((stop) => ({
    name: stop.name,
    sequence: stop.sequence,
    lat: stop.lat,
    lon: stop.lon,
  }))

  const resetForm = () => {
    setRouteName("")
    setDescription("")
    setBaseFare("40")
    setStops([])
  }

  const handleCreate = () => {
    if (!routeName) {
      toast({ title: "Error", description: "Route name is required.", variant: "destructive" })
      return
    }

    if (stops.length < 2) {
      toast({ title: "Error", description: "Add at least 2 stops on the map to define a route.", variant: "destructive" })
      return
    }

    createMutation.mutate({
      data: { 
        name: routeName, 
        description, 
        baseFare: Number(baseFare),
        stops,
      }
    }, {
      onSuccess: () => {
        setIsCreateOpen(false)
        resetForm()
        refetch()
        toast({ title: "Route Created", description: `${routeName} has been added to the network.` })
      },
      onError: () => {
        toast({ title: "Creation Failed", description: "Could not add route.", variant: "destructive" })
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-accent flex items-center gap-2">
            <Route className="h-8 w-8" />
            Loop Routes
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage fixed-route transit lines across the province.
          </p>
        </div>
        
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground border-accent-border">
              <PlusCircle className="h-4 w-4" />
              New Loop Route
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Loop Route</DialogTitle>
              <DialogDescription>
                Define a new fixed route for dispatching vehicles.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4 md:grid-cols-2">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Route Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g. Luna Central Loop" 
                    value={routeName}
                    onChange={e => setRouteName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fare">Base Fare (PHP)</Label>
                  <Input 
                    id="fare" 
                    type="number" 
                    value={baseFare}
                    onChange={e => setBaseFare(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="desc">Description</Label>
                  <Textarea 
                    id="desc" 
                    placeholder="Describe the route coverage..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Route Stops</Label>
                <RouteMapPicker stops={stops} onChange={setStops} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                {createMutation.isPending ? "Creating..." : "Save Route"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
              <CardContent><Skeleton className="h-20 w-full" /></CardContent>
            </Card>
          ))
        ) : routes.length === 0 ? (
          <div className="col-span-full h-32 flex items-center justify-center text-muted-foreground border rounded-xl border-dashed">
            No routes configured yet.
          </div>
        ) : (
          routes.map(route => (
            <Card key={route.id} className="hover-elevate transition-all border-accent/20">
              <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-accent" />
                    {route.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[40px]">
                    {route.description || "No description provided."}
                  </CardDescription>
                </div>
                {route.isActive ? (
                  <Badge variant="success" className="shrink-0">Active</Badge>
                ) : (
                  <Badge variant="secondary" className="shrink-0">Inactive</Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center bg-muted/50 p-3 rounded-lg border">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground font-medium">Base Fare</span>
                    <span className="font-bold text-foreground">{formatPHP(route.baseFare)}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRouteId(route.id)}
                    className="h-auto gap-2 px-2 py-1 text-xs font-medium text-accent hover:text-accent"
                  >
                    <MapPin className="h-3 w-3" /> View Stops
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog
        open={selectedRouteId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRouteId(null)
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5 text-accent" />
              {routeDetail.data?.route.name ?? "Route stops"}
            </DialogTitle>
            <DialogDescription>
              Ordered stops and the published road-following route.
            </DialogDescription>
          </DialogHeader>

          {routeDetail.isLoading ? (
            <div className="flex h-80 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading route stops…
            </div>
          ) : routeDetail.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="font-semibold text-destructive">Could not load this route.</p>
              <Button variant="outline" className="mt-4" onClick={() => routeDetail.refetch()}>Try again</Button>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.55fr_0.75fr]">
              <div className="space-y-3">
                <RouteStopsMap
                  stops={selectedStops}
                  routePolyline={routeDetail.data?.route.routePolyline}
                />
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span>{selectedStops.length} stop{selectedStops.length === 1 ? "" : "s"}</span>
                  {routeDetail.data?.route.distanceKm != null && (
                    <span>{routeDetail.data.route.distanceKm.toFixed(1)} km by road</span>
                  )}
                  {routeDetail.data?.route.routeDurationSeconds != null && (
                    <span>About {Math.max(1, Math.round(routeDetail.data.route.routeDurationSeconds / 60))} minutes</span>
                  )}
                </div>
              </div>

              <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                {selectedStops.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    This route has no saved stops.
                  </div>
                ) : (
                  [...selectedStops]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((stop) => (
                      <div key={`${stop.sequence}-${stop.lat}`} className="flex gap-3 rounded-xl border bg-muted/30 p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
                          {stop.sequence}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold">{stop.name}</p>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {stop.lat.toFixed(5)}, {stop.lon.toFixed(5)}
                          </p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
