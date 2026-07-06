import React, { useState } from "react"
import { useListIncidents, useUpdateIncident } from "@workspace/api-client-react"
import { formatDate } from "@/lib/utils"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, MapPin, Search, Wrench, Waves, Eye } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { IncidentReport } from "@workspace/api-client-react"

export default function Incidents() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  
  const { data, isLoading, refetch } = useListIncidents(
    { limit: 50, offset: 0 },
    { query: { queryKey: ["list-incidents", 50, 0] } }
  )
  
  const updateIncident = useUpdateIncident()

  const incidents: IncidentReport[] = data?.reports ?? []
  const filtered = statusFilter === "all" ? incidents : incidents.filter(i => i.status === statusFilter)

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "accident": return <AlertTriangle className="h-4 w-4 text-destructive" />
      case "flood": return <Waves className="h-4 w-4 text-blue-500" />
      case "fleet_issue": return <Wrench className="h-4 w-4 text-amber-500" />
      default: return <AlertTriangle className="h-4 w-4" />
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical": return <Badge variant="destructive" className="animate-pulse">Critical</Badge>
      case "high": return <Badge variant="destructive">High</Badge>
      case "medium": return <Badge className="bg-amber-500 hover:bg-amber-600 border-transparent text-white">Medium</Badge>
      case "low": return <Badge className="bg-blue-500 hover:bg-blue-600 border-transparent text-white">Low</Badge>
      default: return <Badge variant="outline">{severity}</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">Open</Badge>
      case "reviewing": return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20">Reviewing</Badge>
      case "resolved": return <Badge variant="success">Resolved</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const handleStatusChange = (id: number, newStatus: "reviewing" | "resolved") => {
    updateIncident.mutate(
      { id, data: { status: newStatus } },
      { onSuccess: () => refetch() },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-destructive flex items-center gap-2">
            <AlertTriangle className="h-8 w-8" />
            Incidents
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and resolve reports from drivers and passengers.
          </p>
        </div>
      </div>

      <Card className="border-destructive/20">
        <CardHeader className="pb-3 border-b border-destructive/10 bg-destructive/5 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="w-full sm:w-[200px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="border-destructive/30 focus:ring-destructive/50">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="reviewing">Reviewing</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Type & Severity</TableHead>
                <TableHead className="min-w-[250px]">Description</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No incidents reported matching the filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((incident) => (
                  <TableRow key={incident.id} className="group">
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-sm font-medium capitalize">
                          {getTypeIcon(incident.type)}
                          {incident.type.replace('_', ' ')}
                        </div>
                        {getSeverityBadge(incident.severity)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-relaxed">
                        {incident.description || "No description provided"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        Reported by: {incident.reporterId}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-mono bg-muted/50 w-fit px-2 py-1 rounded">
                        <MapPin className="h-3.5 w-3.5" />
                        {incident.lat.toFixed(4)}, {incident.lon.toFixed(4)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(incident.status)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(incident.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={incident.status} 
                        onValueChange={(val: any) => handleStatusChange(incident.id, val)}
                        disabled={incident.status === "resolved"}
                      >
                        <SelectTrigger className="w-[110px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open" disabled>Open</SelectItem>
                          <SelectItem value="reviewing">Reviewing</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
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