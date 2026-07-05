import React, { useState } from "react"
import { useListUsers } from "@workspace/api-client-react"
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
import { Search, UserCircle, ShieldAlert } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export default function Users() {
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  const { data, isLoading } = useListUsers(
    { limit: 100, offset: 0 },
    { query: { queryKey: ["list-users", 100, 0] } }
  )

  // Mock data
  const mockUsers = [
    { id: "u1", email: "admin@moveapayao.ph", fullName: "System Admin", phone: "0900-000-0000", role: "admin", isActive: true, createdAt: new Date(Date.now() - 31536000000).toISOString() },
    { id: "u2", email: "passenger1@test.com", fullName: "Maria Clara", phone: "0917-888-9999", role: "passenger", isActive: true, createdAt: new Date(Date.now() - 864000000).toISOString() },
    { id: "u3", email: "driver1@test.com", fullName: "Jose Rizal", phone: "0918-777-6666", role: "driver", isActive: true, createdAt: new Date(Date.now() - 1728000000).toISOString() },
    { id: "u4", email: "banned@test.com", fullName: "Banned User", phone: "0999-999-9999", role: "passenger", isActive: false, createdAt: new Date(Date.now() - 2592000000).toISOString() },
  ]

  const users = data?.users || mockUsers
  const filtered = users.filter(u => {
    const matchRole = roleFilter === "all" || u.role === roleFilter
    const matchSearch = (u.fullName?.toLowerCase() || "").includes(search.toLowerCase()) || 
                        (u.email?.toLowerCase() || "").includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin": return <Badge className="bg-sidebar text-sidebar-foreground border-transparent">Admin</Badge>
      case "driver": return <Badge className="bg-primary text-primary-foreground border-transparent">Driver</Badge>
      case "passenger": return <Badge variant="secondary">Passenger</Badge>
      default: return <Badge variant="outline">{role}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">
            Directory of all registered accounts in the system.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search name or email..."
                className="w-full pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-[200px]">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="passenger">Passengers</SelectItem>
                  <SelectItem value="driver">Drivers</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarFallback className="bg-secondary text-secondary-foreground font-medium">
                            {user.fullName?.substring(0, 2).toUpperCase() || <UserCircle className="h-5 w-5" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-semibold">{user.fullName || "Unnamed User"}</span>
                          <span className="text-xs text-muted-foreground">{user.email} {user.phone && `• ${user.phone}`}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getRoleBadge(user.role)}
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <Badge variant="success" className="px-2.5">Active</Badge>
                      ) : (
                        <Badge variant="destructive" className="px-2.5 flex w-fit items-center gap-1">
                          <ShieldAlert className="w-3 h-3" />
                          Suspended
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded" title={user.id}>
                        {user.id.substring(0, 8)}...
                      </span>
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
