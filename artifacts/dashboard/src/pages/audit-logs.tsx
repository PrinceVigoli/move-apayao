import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
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
import { ShieldCheck } from "lucide-react"

interface AuditLog {
  id: number
  action: string
  amount: number | null
  metadata: Record<string, unknown> | null
  createdAt: string
  actorId: string
  actorEmail: string | null
  targetUserId: string | null
}

async function fetchAuditLogs(): Promise<{ logs: AuditLog[] }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const res = await fetch("/api/audit-logs?limit=50", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    throw new Error(`Failed to load audit logs (${res.status})`)
  }

  return res.json()
}

function actionLabel(action: string) {
  switch (action) {
    case "wallet.topup":
      return "Wallet Top-up"
    default:
      return action
  }
}

export default function AuditLogs() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: fetchAuditLogs,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" />
          Audit Logs
        </h1>
        <p className="text-muted-foreground mt-1">
          Sensitive and financial admin actions, newest first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Wallet top-ups and refunds performed by admins.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-destructive">Failed to load audit logs.</p>
          )}

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!isLoading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Target User</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No audit logs yet.
                    </TableCell>
                  </TableRow>
                )}
                {data?.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="secondary">{actionLabel(log.action)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.actorEmail ?? log.actorId.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.targetUserId ? log.targetUserId.slice(0, 8) + "..." : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {log.amount != null ? formatPHP(log.amount) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(log.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}