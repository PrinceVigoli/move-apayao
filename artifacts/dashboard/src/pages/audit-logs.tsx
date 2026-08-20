import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getAccessToken } from "@/lib/session"
import { formatPHP, formatDate } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Activity, Search, ShieldCheck, UserCog } from "lucide-react"

interface AuditLog {
  id: number
  action: string
  amount: number | null
  metadata: Record<string, unknown> | null
  createdAt: string
  actorId: string
  actorEmail: string | null
  targetUserId: string | null
  targetEmail: string | null
  targetName: string | null
}

async function fetchAuditLogs(): Promise<{ logs: AuditLog[] }> {
  const token = await getAccessToken()
  const response = await fetch("/api/audit-logs?limit=50", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    throw new Error(`Failed to load audit logs (${response.status})`)
  }

  return response.json()
}

function actionLabel(action: string) {
  switch (action) {
    case "driver.application.approved":
      return "Driver approved"
    case "driver.application.rejected":
      return "Application rejected"
    case "driver.access.revoked":
      return "Driver access revoked"
    default:
      return action
  }
}

function actionVariant(action: string): "secondary" | "success" | "destructive" | "outline" {
  if (action === "driver.application.approved") return "success"
  if (action === "driver.application.rejected" || action === "driver.access.revoked") {
    return "destructive"
  }
  if (action.startsWith("driver.")) return "outline"
  return "secondary"
}

function metadataValue(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" && value.trim() ? value : null
}

export default function AuditLogs() {
  const [category, setCategory] = useState("all")
  const [search, setSearch] = useState("")
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: fetchAuditLogs,
  })

  const logs = data?.logs ?? []
  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter((log) => {
      const matchesCategory =
        category === "all" ||
        (category === "driver" && log.action.startsWith("driver.")) ||
        (category === "financial" &&
          (log.action.startsWith("wallet.") || log.action.startsWith("payment.")))
      const reason = metadataValue(log.metadata, "reason") ?? ""
      const matchesSearch =
        !q ||
        actionLabel(log.action).toLowerCase().includes(q) ||
        (log.actorEmail ?? "").toLowerCase().includes(q) ||
        (log.targetEmail ?? "").toLowerCase().includes(q) ||
        (log.targetName ?? "").toLowerCase().includes(q) ||
        reason.toLowerCase().includes(q)
      return matchesCategory && matchesSearch
    })
  }, [category, logs, search])

  const driverSecurityCount = logs.filter((log) => log.action.startsWith("driver.")).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ShieldCheck className="h-7 w-7 text-primary" />
          Audit Logs
        </h1>
        <p className="mt-1 text-muted-foreground">
          Security-sensitive and financial administrator activity, newest first.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recorded activity</p>
              <p className="mt-1 text-2xl font-bold">{logs.length}</p>
            </div>
            <Activity className="h-7 w-7 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Driver security actions</p>
              <p className="mt-1 text-2xl font-bold">{driverSecurityCount}</p>
            </div>
            <UserCog className="h-7 w-7 text-amber-600" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 border-b">
          <div>
            <CardTitle>Security monitoring</CardTitle>
            <CardDescription>Who performed each privileged action, who it affected, and why.</CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search administrator, driver, or reason..."
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                <SelectItem value="driver">Driver security</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && <p className="p-6 text-sm text-destructive">Failed to load audit logs.</p>}

          {isLoading && (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!isLoading && !error && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Administrator</TableHead>
                    <TableHead>Target user</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {logs.length === 0 ? "No audit logs yet." : "No activity matches these filters."}
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredLogs.map((log) => {
                    const reason = metadataValue(log.metadata, "reason")
                    const previousStatus = metadataValue(log.metadata, "previousStatus")
                    const newStatus = metadataValue(log.metadata, "newStatus")
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant={actionVariant(log.action)}>{actionLabel(log.action)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{log.actorEmail ?? log.actorId.slice(0, 8)}</TableCell>
                        <TableCell className="text-sm">
                          <p>{log.targetName ?? log.targetEmail ?? (log.targetUserId ? `${log.targetUserId.slice(0, 8)}...` : "-")}</p>
                          {log.targetName && log.targetEmail && <p className="text-xs text-muted-foreground">{log.targetEmail}</p>}
                        </TableCell>
                        <TableCell className="max-w-xs text-sm text-muted-foreground">
                          <p className="whitespace-normal">
                            {reason ?? (previousStatus && newStatus ? `${previousStatus} to ${newStatus}` : "-")}
                          </p>
                        </TableCell>
                        <TableCell className="font-medium">{log.amount != null ? formatPHP(log.amount) : "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(log.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
