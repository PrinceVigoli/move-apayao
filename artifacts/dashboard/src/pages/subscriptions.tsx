import React, { useState } from "react"
import { useListSubscriptions, useCreateSubscription, useListUsers } from "@workspace/api-client-react"
import { formatDate } from "@/lib/utils"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CreditCard, PlusCircle, Calendar as CalendarIcon, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { Subscription } from "@workspace/api-client-react"

export default function Subscriptions() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [selectedPlan, setSelectedPlan] = useState<string>("premium_monthly")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const { toast } = useToast()

  const { data: usersData } = useListUsers(
    { limit: 100, offset: 0 },
    { query: { queryKey: ["list-users", 100, 0] } }
  )

  const { data: subsData, isLoading, refetch } = useListSubscriptions(
    { limit: 50, offset: 0 },
    { query: { queryKey: ["list-subscriptions", 50, 0] } }
  )

  const createMutation = useCreateSubscription()

  // Mock data
  const mockSubs = [
    { id: 1, userId: "u1", plan: "premium_monthly", status: "active", startsAt: new Date(Date.now() - 864000000).toISOString(), expiresAt: new Date(Date.now() + 1728000000).toISOString(), createdAt: new Date(Date.now() - 864000000).toISOString() },
    { id: 2, userId: "u2", plan: "basic_weekly", status: "expired", startsAt: new Date(Date.now() - 1728000000).toISOString(), expiresAt: new Date(Date.now() - 86400000).toISOString(), createdAt: new Date(Date.now() - 1728000000).toISOString() },
    { id: 3, userId: "u3", plan: "premium_yearly", status: "active", startsAt: new Date(Date.now() - 4000000000).toISOString(), expiresAt: new Date(Date.now() + 27000000000).toISOString(), createdAt: new Date(Date.now() - 4000000000).toISOString() },
  ] as Subscription[]

  const mockUsers = [
    { id: "u1", fullName: "System Admin" },
    { id: "u2", fullName: "Maria Clara" },
    { id: "u3", fullName: "Jose Rizal" },
  ]

  const subs = subsData?.subscriptions || mockSubs
  const users = usersData?.users || mockUsers

  const enrichedSubs = subs.map(s => {
    const user = users.find(u => u.id === s.userId)
    return { ...s, userName: user?.fullName || "Unknown User" }
  })

  const filtered = statusFilter === "all" ? enrichedSubs : enrichedSubs.filter(s => s.status === statusFilter)

  const handleCreate = () => {
    if (!selectedUserId) {
      toast({ title: "Error", description: "Select a user first.", variant: "destructive" })
      return
    }

    createMutation.mutate({
      data: { userId: selectedUserId, plan: selectedPlan }
    }, {
      onSuccess: () => {
        setIsCreateOpen(false)
        setSelectedUserId("")
        refetch()
        toast({ title: "Success", description: "Subscription created." })
      },
      onError: () => {
        toast({ title: "Error", description: "Could not create subscription.", variant: "destructive" })
      }
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="success" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Active</Badge>
      case "expired": return <Badge variant="secondary" className="gap-1"><CalendarIcon className="w-3 h-3" /> Expired</Badge>
      case "cancelled": return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Cancelled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatPlanName = (plan: string) => {
    return plan.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <CreditCard className="h-8 w-8" />
            Subscriptions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage passenger and driver recurring plans.
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white border-blue-700">
              <PlusCircle className="h-4 w-4" />
              New Subscription
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Subscription</DialogTitle>
              <DialogDescription>
                Assign a new subscription plan to a user.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="user">User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger id="user">
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName} ({u.id.substring(0, 8)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan">Plan</Label>
                <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                  <SelectTrigger id="plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic_weekly">Basic Weekly</SelectItem>
                    <SelectItem value="premium_monthly">Premium Monthly</SelectItem>
                    <SelectItem value="premium_yearly">Premium Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {createMutation.isPending ? "Creating..." : "Create Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="w-full sm:w-[200px]">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Starts At</TableHead>
                <TableHead className="text-right">Expires At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No subscriptions found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <div className="font-semibold">{sub.userName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{sub.userId.substring(0, 8)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{formatPlanName(sub.plan)}</div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(sub.status)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(sub.startsAt)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDate(sub.expiresAt)}
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
