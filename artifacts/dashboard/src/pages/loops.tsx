import React, { useState } from "react"
import { useListLoopRoutes, useCreateLoopRoute } from "@workspace/api-client-react"
import { formatPHP } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
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
import { Route, PlusCircle, Navigation, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RouteMapPicker, type RouteStop } from "@/components/route-map-picker"

export default function Loops() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [routeName, setRouteName] = useState("")
  const [baseFare, setBaseFare] = useState("40")
  const [description, setDescription] = useState("")
  const [stops, setStops] = useState<RouteStop[]>([])
  const { toast } = useToast()

  const { data, isLoading, refetch } = useListLoopRoutes({
    query: { queryKey: ["list-loop-routes"] }
  })

  const createMutation = useCreateLoopRoute()

  // Mock data
  const mockRoutes = [
    { id: 1, name: "Luna Central Loop", description: "Connects municipal hall, market, and hospital", baseFare: 40, isActive: true, createdAt: new Date().toISOString() },
    { id: 2, name: "Pudtol Express", description: "Direct route from boundary to center", baseFare: 50, isActive: true, createdAt: new Date().toISOString() },
    { id: 3, name: "Conner Highland Route", description: "Mountain route connecting upper barangays", baseFare: 60, isActive: false, createdAt: new Date().toISOString() },
  ]

  const routes = data?.routes || mockRoutes

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
                  <div className="flex items-center gap-2 text-xs font-medium text-accent hover:underline cursor-pointer">
                    <MapPin className="h-3 w-3" /> View Stops
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}