import { useState } from "react";
import { useListAccountDeletionRequests, useReviewAccountDeletionRequest, type AccountDeletionAdminItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function AccountDeletion() {
  const [status,setStatus]=useState<"pending"|"reviewing"|"completed">("pending"),[offset,setOffset]=useState(0);
  const query=useListAccountDeletionRequests({status,limit:50,offset});
  const mutation=useReviewAccountDeletionRequest();
  const [selected,setSelected]=useState<AccountDeletionAdminItem|null>(null),[reason,setReason]=useState(""),[until,setUntil]=useState(""),[confirmed,setConfirmed]=useState(false),[error,setError]=useState("");
  function act(item:AccountDeletionAdminItem,action:"review"|"complete") {
    if(action==="complete"&&!confirmed)return;
    setError("");
    mutation.mutate({id:item.reference,data:{action,...(action==="complete"?{confirmDeletion:true,...(reason.trim()?{retentionReason:reason.trim()}:{}),...(until?{retentionUntil:new Date(until+"T23:59:59+08:00").toISOString()}: {})}:{})}},{onSuccess:()=>{setSelected(null);setReason("");setUntil("");setConfirmed(false);query.refetch();},onError:e=>setError(e.message)});
  }
  return <div className="space-y-6"><header><h1 className="text-3xl font-bold">Account deletion requests</h1><p className="mt-2 text-muted-foreground">Identity-verified requests from the apps and public website. Review promptly; the published completion target is 30 days.</p></header>
    <Card><CardHeader><div className="flex flex-wrap gap-3">{(["pending","reviewing","completed"] as const).map(value=><Button key={value} variant={status===value?"default":"outline"} onClick={()=>{setStatus(value);setOffset(0);setSelected(null);}}>{value}</Button>)}<Button variant="outline" onClick={()=>query.refetch()}>Refresh</Button></div></CardHeader><CardContent className="space-y-4">
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    {query.isLoading?<p>Loading requests…</p>:query.isError?<p role="alert">Could not load requests. Use Refresh to retry.</p>:!query.data?.requests.length?<p>No requests in this view.</p>:query.data.requests.map(item=>{
      const due=new Date(new Date(item.requestedAt).getTime()+30*86400_000);
      return <section key={item.reference} className="rounded-xl border p-5 space-y-3"><h2 className="font-semibold">{item.name??"Deleted account"} · {item.role}</h2>{item.email&&<p>{item.email}</p>}<p className="text-sm break-all">Reference: {item.reference}</p><p className="text-sm">Received: {new Date(item.requestedAt).toLocaleString()} · Target: {due.toLocaleDateString()}</p>
        {item.status!=="completed"&&due.getTime()<Date.now()&&<p className="font-semibold text-destructive">Review overdue. Contact the requester and resolve the hold.</p>}
        {item.retentionReason&&<p>Retained records: {item.retentionReason}<br/>Retention end: {new Date(item.retentionUntil!).toLocaleDateString()}{Date.parse(item.retentionUntil!)<Date.now()&&<strong className="block text-destructive">Retention has ended. Complete the documented purge/redaction and review any continuing legal hold.</strong>}</p>}
        {item.status!=="completed"&&<div className="flex flex-wrap gap-3"><Button disabled={mutation.isPending} variant="outline" onClick={()=>act(item,"review")}>Mark reviewing</Button><Button disabled={mutation.isPending} variant="destructive" onClick={()=>{setSelected(item);setReason("");setUntil("");setConfirmed(false);setError("");}}>Review permanent deletion</Button></div>}
        {selected?.reference===item.reference&&<div className="border-t pt-4 space-y-4"><p>Resolve active journeys/reservations, pending top-ups and wallet balances first. For drivers, reassign or disable an enabled fixed-loop service. The server enforces these holds.</p><p>Completion permanently removes account credentials/profile/contact data, push tokens, sessions, resets, app feedback, driver-phone GPS and rating comments. Retained operational records use a non-identifying account placeholder.</p><label className="block">Specific retention reason, record categories and lawful basis (required when history exists, or when backups must be retained)<Textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} placeholder="State only the necessary record categories and verified retention basis. Do not include names, email addresses or passwords."/></label><label className="block">Retention end date<Input type="date" value={until} onChange={e=>setUntil(e.target.value)}/></label><p className="text-sm text-muted-foreground">The reason and end date are visible through the private receipt. Confirm applicable backup retention and any service-provider deletion obligations. Do not invent a statutory retention period. Review and purge/redact retained records at the stated end date; this action does not automatically purge shared trip/financial records.</p><label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I verified this request, resolved service/balance holds and documented any necessary retention. I authorize permanent deletion of this account's erasable personal data.</span></label><div className="flex gap-3"><Button variant="destructive" disabled={!confirmed||mutation.isPending} onClick={()=>act(item,"complete")}>{mutation.isPending?"Processing…":"Permanently delete account data"}</Button><Button variant="outline" disabled={mutation.isPending} onClick={()=>setSelected(null)}>Close</Button></div></div>}
      </section>;
    })}
    <div className="flex justify-between"><Button variant="outline" disabled={offset===0||query.isLoading} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</Button><Button variant="outline" disabled={query.isLoading||query.isError||(query.data?.requests.length??0)<50} onClick={()=>setOffset(n=>n+50)}>Next</Button></div>
    </CardContent></Card>
  </div>;
}
