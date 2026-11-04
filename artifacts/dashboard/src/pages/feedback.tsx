import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListFeedbackQueryKey, useListFeedback, useUpdateFeedback } from "@workspace/api-client-react";
import { MessageSquare } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const categoryLabels: Record<string, string> = { bug: "App bug", suggestion: "Suggestion", other: "Other feedback" };
export default function Feedback() {
  const [status, setStatus] = useState<"all" | "open" | "reviewing" | "resolved">("all");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const { data, isLoading, isError, refetch } = useListFeedback({ limit: 50, offset, status: status === "all" ? undefined : status });
  const update = useUpdateFeedback();
  const changeStatus = (id: number, value: string) => {
    if (value !== "open" && value !== "reviewing" && value !== "resolved") return;
    setError("");
    update.mutate({ id, data: { status: value } }, {
      onSuccess: () => client.invalidateQueries({ queryKey: getListFeedbackQueryKey() }),
      onError: () => setError("Could not update the feedback status. Please try again."),
    });
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><MessageSquare className="h-8 w-8" />App feedback</h1>
        <p className="text-muted-foreground mt-1">Review app bugs and suggestions from passengers and follow up on reported problems.</p>
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <Select value={status} onValueChange={value => {
            if (value === "all" || value === "open" || value === "reviewing" || value === "resolved") { setStatus(value); setOffset(0); }
          }}>
            <SelectTrigger className="w-48" aria-label="Filter feedback status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="reviewing">Reviewing</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
        </CardHeader>
        <CardContent>
          {isError ? <p role="alert" className="text-destructive">Could not load feedback. Use Refresh to retry.</p> : <Table>
            <TableHeader><TableRow><TableHead>Feedback</TableHead><TableHead>Passenger</TableHead><TableHead>App</TableHead><TableHead>Received</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={5}>Loading feedback…</TableCell></TableRow> : !data?.feedback.length ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No feedback in this view.</TableCell></TableRow> : data.feedback.map(item => <TableRow key={item.id}>
                <TableCell className="min-w-64 max-w-xl"><p className="font-semibold">#{item.id} · {categoryLabels[item.category]}</p><p className="whitespace-pre-wrap break-words mt-1">{item.message}</p></TableCell>
                <TableCell><p>{item.reporterName || "Passenger"}</p><p className="text-xs text-muted-foreground break-all">{item.reporterEmail || item.reporterId}</p></TableCell>
                <TableCell>{item.platform || "Unknown platform"}<p className="text-xs text-muted-foreground">{item.appVersion || "Version not supplied"}</p></TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(item.createdAt)}</TableCell>
                <TableCell><Select value={item.status} onValueChange={value => changeStatus(item.id, value)} disabled={update.isPending}><SelectTrigger className="w-36" aria-label={`Status for feedback ${item.id}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="reviewing">Reviewing</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>}
          <div className="flex justify-between items-center mt-5"><Button variant="outline" disabled={offset === 0 || isLoading} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</Button><span className="text-sm text-muted-foreground">Page {Math.floor(offset / 50) + 1}</span><Button variant="outline" disabled={isLoading || isError || (data?.feedback.length ?? 0) < 50} onClick={() => setOffset(value => value + 50)}>Next</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
