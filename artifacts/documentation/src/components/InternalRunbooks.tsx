import { KeyRound, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { apiUrl, readApiJson } from "../lib/api";

type Runbook = { id: string; title: string; purpose: string; steps: string[]; escalation: string };
type RunbookResponse = { version: string; updatedAt: string; runbooks: Runbook[] };

export function InternalRunbooks() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [runbooks, setRunbooks] = useState<RunbookResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadRunbooks = async (accessToken: string) => {
    const response = await fetch(apiUrl("/docs/internal/runbooks"), { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 403 ? "Only developer and superadmin accounts can open these runbooks." : "Your secure session expired or the API is unavailable.");
    setRunbooks(await readApiJson<RunbookResponse>(response));
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/auth/login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) });
      const result = await readApiJson<{ accessToken?: string; user?: { role?: string; fullName?: string | null; email?: string }; error?: string }>(response);
      if (!response.ok || !result.accessToken || !result.user) throw new Error(result.error ?? "Sign-in failed.");
      if (!result.user.role || !["developer", "superadmin"].includes(result.user.role)) throw new Error("Only developer and superadmin accounts can open these runbooks.");
      await loadRunbooks(result.accessToken);
      setToken(result.accessToken);
      setUserName(result.user.fullName || result.user.email || result.user.role);
      setPassword("");
    } catch (caught) {
      setToken(null);
      setRunbooks(null);
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    setToken(null);
    setRunbooks(null);
    setUserName("");
    setPassword("");
  };

  if (token && runbooks) return <div className="runbooks">
    <div className="secure-session"><ShieldCheck /><div><strong>Restricted session</strong><span>Signed in as {userName} · Runbooks {runbooks.version}</span></div><button type="button" onClick={signOut}><LogOut size={15} />Sign out</button></div>
    {runbooks.runbooks.map((runbook) => <article className="runbook-card" key={runbook.id}><div className="runbook-number">{String(runbooks.runbooks.indexOf(runbook) + 1).padStart(2, "0")}</div><div><p>Internal procedure</p><h2>{runbook.title}</h2><div className="runbook-purpose">{runbook.purpose}</div><ol>{runbook.steps.map((step) => <li key={step}>{step}</li>)}</ol><aside><strong>Escalation:</strong> {runbook.escalation}</aside></div></article>)}
    <p className="checked-at">Internal content last updated {runbooks.updatedAt}. Access is checked by the API and logged.</p>
  </div>;

  return <div className="runbook-login">
    <div className="lock-illustration"><LockKeyhole size={32} /><span><KeyRound size={18} /></span></div>
    <p className="eyebrow">API-protected content</p><h2>Developer sign-in required</h2>
    <p>Runbook text is not shipped in this public website bundle. The API releases it only after confirming an active developer or superadmin account.</p>
    <form onSubmit={signIn}>
      <label>Email or phone<input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading}>{loading ? <LoaderCircle className="spinning" size={17} /> : <KeyRound size={17} />}{loading ? "Verifying…" : "Open secure runbooks"}</button>
    </form>
    <small>Credentials and access tokens stay in memory and are cleared when this page is reloaded or closed.</small>
  </div>;
}
