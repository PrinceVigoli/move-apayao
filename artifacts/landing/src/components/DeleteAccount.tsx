import { useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { publicContact } from "@/content/site";

type Receipt = {reference:string;status:string;requestedAt:string;completedAt:string|null;retentionReason:string|null;retentionUntil:string|null};
const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/,"");
export function DeleteAccount() {
  const [email,setEmail]=useState(""), [password,setPassword]=useState(""), [confirm,setConfirm]=useState(false);
  const [receipt,setReceipt]=useState<Receipt|null>(null), [reference,setReference]=useState(()=>new URLSearchParams(window.location.search).get("reference")??"");
  const [pending,setPending]=useState(false), [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function resetPassword() {
    if (!email.trim()) { setError("Enter your account email above before requesting a reset."); return; }
    setPending(true);setError("");setNotice("");
    try { const response=await fetch(`${API}/api/auth/forgot-password`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim()}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error("Could not request a password reset. Contact project support if needed.");setNotice("If this is an active account, a reset link will be sent to its email address. For deactivated accounts or lost email access, contact support for identity verification."); }
    catch(e){setError(e instanceof Error?e.message:"Could not request a reset.");}finally{setPending(false);}
  }
  async function send(event:FormEvent) {
    event.preventDefault();setError("");setPending(true);
    try {
      const response=await fetch(`${API}/api/account-deletion/requests`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,confirm}),signal:AbortSignal.timeout(20000),cache:"no-store"});
      const body=await response.json();if(!response.ok)throw Error(body.error??"Could not submit your request.");
      setReceipt(body.request);setReference(body.request.reference);setPassword("");
    } catch(e) {setError(e instanceof Error?e.message:"Check your connection and retry.");} finally {setPending(false);}
  }
  async function check(event:FormEvent) {
    event.preventDefault();setError("");setPending(true);
    try {const response=await fetch(`${API}/api/account-deletion/requests/${encodeURIComponent(reference.trim())}`,{signal:AbortSignal.timeout(15000),cache:"no-store"});const body=await response.json();if(!response.ok)throw Error(body.error??"Could not check this request.");setReceipt(body.request);}
    catch(e){setError(e instanceof Error?e.message:"Could not check your request.");}finally{setPending(false);}
  }
  return <main className="min-h-screen bg-background px-5 py-10"><article className="mx-auto max-w-3xl rounded-3xl border border-border bg-white p-6 sm:p-10">
    <a href="/" className="inline-flex items-center gap-2 text-primary"><ArrowLeft size={18}/>MOVE Apayao home</a>
    <ShieldCheck size={38} className="mt-8 text-primary"/><h1 className="mt-4 text-3xl font-bold">Delete your MOVE Apayao account</h1>
    <p className="mt-4 leading-7">Request permanent deletion of your passenger or driver account and associated personal data. This page is available without installing or signing into the app. Your account email and current password verify that the request is yours.</p>
    <h2 className="mt-7 text-xl font-bold">How deletion works</h2>
    <ol className="mt-3 list-decimal space-y-2 pl-6 leading-7"><li>Submit the verified request below and keep your private reference.</li><li>The project team reviews active journeys, reservations, balances and any required records retention. A request does not immediately disable your account.</li><li>When completed, your account cannot be restored. Login credentials, contact/profile details, device push tokens, password-reset/session records, app feedback and driver-phone GPS history are removed. Profile and identity fields in the driver record are cleared.</li></ol>
    <p className="mt-4 leading-7">Trip, reservation, fare, incident and vehicle-assignment records may be retained only for a documented legal, safety, fraud-prevention or financial requirement. The team must record the reason and retention end date before completing a request with such history. You can view these details using your private reference. A non-identifying account placeholder keeps required record references valid.</p>
    <p className="mt-4 leading-7">Processing is reviewed by the project team, rather than automatic deletion after 90 days. Active trips, pending payments or a wallet balance must be resolved first. Use your request reference to follow up with <a className="text-primary underline" href={`mailto:${publicContact.supportEmail}`}>{publicContact.supportEmail}</a>. Required retention is managed separately until the stated end date.</p>
    <p className="mt-4 leading-7">We aim to complete verified requests within 30 days. If an active journey, unsettled balance or a legally required retention review delays completion, contact project support with your reference for the next steps. A backup created before deletion may retain older data until it is retired under the project's backup policy; deleted accounts must remain deleted if a backup is restored.</p>
    {notice&&<p role="status" className="mt-4 rounded-xl border border-border p-4">{notice}</p>}
    {error&&<p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {receipt ? <section className="mt-7 rounded-2xl border border-border p-5" aria-live="polite"><h2 className="text-xl font-bold">Deletion request {receipt.status}</h2><p className="mt-3 break-all">Private reference: <strong>{receipt.reference}</strong></p><p className="mt-3">Keep this reference private. It lets you check your request without signing in, including after your account has been deleted.</p>{receipt.retentionReason&&<p className="mt-3">Retained operational records: {receipt.retentionReason}<br/>Retention end: {new Date(receipt.retentionUntil!).toLocaleDateString("en-PH")}</p>}<button className="button button-secondary mt-4" disabled={pending} onClick={()=>{setReceipt(null);setEmail("");}}>Back to request form</button></section> : <form className="mt-8 space-y-4" onSubmit={send}><h2 className="text-xl font-bold">Request account deletion</h2><label className="block">Account email<input className="mt-2 w-full rounded-xl border border-border p-3" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} disabled={pending}/></label><label className="block">Current password<input className="mt-2 w-full rounded-xl border border-border p-3" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={256} disabled={pending}/></label><p>Deactivated accounts can submit a request with their existing password. If you cannot recover your password or access your email, contact project support with the subject ?MOVE Apayao account deletion? and your account email. Identity must be verified before deletion. Never send your password by email.</p><button type="button" className="text-primary underline" onClick={resetPassword} disabled={pending}>Forgot password? Send a reset link</button><label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={confirm} onChange={e=>setConfirm(e.target.checked)} required disabled={pending}/><span>I request permanent deletion of my MOVE Apayao account and personal data, subject to the records-retention explanation above.</span></label><button type="submit" className="button button-primary" disabled={pending||!confirm}>{pending?"Submitting…":"Submit deletion request"}</button></form>}
    <form onSubmit={check} className="mt-9 space-y-3 border-t border-border pt-7"><h2 className="text-xl font-bold">Check an existing request</h2><label className="block">Private request reference<input className="mt-2 w-full rounded-xl border border-border p-3" value={reference} onChange={e=>setReference(e.target.value)} required autoComplete="off" disabled={pending}/></label><button className="button button-secondary" disabled={pending}>Check status</button></form>
    <nav className="mt-8 flex gap-6"><a className="text-primary underline" href="/privacy">Privacy notice</a><a className="text-primary underline" href="/terms">Terms</a></nav>
  </article></main>;
}
