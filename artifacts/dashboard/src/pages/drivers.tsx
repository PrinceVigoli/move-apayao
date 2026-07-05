import React, { useState } from "react"
import { useListUsers } from "@workspace/api-client-react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Star, Car, UserCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// We simulate drivers by fetching users and filtering locally or assuming listUsers takes a role param if it did
export default function Drivers() {
  const { data, isLoading } = useListUsers(
    { limit: 100, offset: 0 },
    { query: { queryKey: ["list-users", 100, 0] } }
  )

  const [search, setSearch] = useState("")

  type DriverProfile = {
    vehicleType: string
    plateNumber: string
    rating: number
    totalTrips: number
    isAvailable: boolean
  }

  // Mock data specifically for drivers, merged with whatever comes back
  const mockDrivers: Array<{
    id: string
    fullName: string
    phone: string
    role: string
    driverProfile?: DriverProfile
  }> = [
    { id: "d1", fullName: "Juan Dela Cruz", phone: "0917-123-4567", role: "driver", driverProfile: { vehicleType: "E-Trike", plateNumber: "AXY-123", rating: 4.8, totalTrips: 342, isAvailable: true } },
    { id: "d2", fullName: "Maria Santos", phone: "0918-987-6543", role: "driver", driverProfile: { vehicleType: "E-Trike", plateNumber: "BZC-456", rating: 4.9, totalTrips: 512, isAvailable: false } },
    { id: "d3", fullName: "Pedro Penduko", phone: "0919-555-4444", role: "driver", driverProfile: { vehicleType: "Tricycle", plateNumber: "TR-999", rating: 4.5, totalTrips: 128, isAvailable: true } },
    { id: "d4", fullName: "Leni Robredo", phone: "0920-111-2222", role: "driver", driverProfile: { vehicleType: "Jeepney", plateNumber: "JEEP-1", rating: 5.0, totalTrips: 890, isAvailable: true } },
  ]

  // Filter to drivers only if API returns all users.
  // The API's User type has no driverProfile field yet, so normalize it to
  // the same optional-driverProfile shape as mockDrivers.
  const apiDrivers = (data?.users.filter(u => u.role === "driver") || []).map(u => ({
    ...u,
    driverProfile: undefined as DriverProfile | undefined,
  }))
  const driversList = apiDrivers.length > 0 ? apiDrivers : mockDrivers

  const filtered = driversList.filter(d => 
    (d.fullName?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (d.phone?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (d.driverProfile?.plateNumber?.toLowerCase() || "").includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Driver Roster</h1>
          <p className="text-muted-foreground mt-1">
            Manage your fleet operators and their vehicles.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search name, phone, or plate number..."
                className="w-full pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vehicle Info</TableHead>
                <TableHead>Performance</TableHead>
                <TableHead className="text-right">Total Trips</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-6 w-32" /></div></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-6 w-10 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No drivers found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((driver) => (
                  <TableRow key={driver.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarFallback className="bg-primary/10 text-primary font-medium">
                            {driver.fullName?.substring(0, 2).toUpperCase() || <UserCircle className="h-5 w-5" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-semibold">{driver.fullName || "Unknown Driver"}</span>
                          <span className="text-xs text-muted-foreground font-mono">{driver.phone}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {driver.driverProfile?.isAvailable ? (
                        <Badge variant="success" className="px-2.5">Available</Badge>
                      ) : (
                        <Badge variant="secondary" className="px-2.5 text-muted-foreground">Offline</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <Car className="h-3.5 w-3.5 text-muted-foreground" />
                          {driver.driverProfile?.vehicleType || "E-Trike"}
                        </div>
                        <Badge variant="outline" className="w-fit text-[10px] font-mono tracking-wider h-5 bg-card">
                          {driver.driverProfile?.plateNumber || "NO PLATE"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 bg-accent/10 w-fit px-2 py-1 rounded border border-accent/20">
                        <Star className="h-3.5 w-3.5 text-accent fill-accent" />
                        <span className="text-sm font-semibold">{driver.driverProfile?.rating?.toFixed(1) || "New"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-medium text-muted-foreground">{driver.driverProfile?.totalTrips || 0}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
