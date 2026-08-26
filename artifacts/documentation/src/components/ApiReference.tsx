import { Check, ChevronDown, Clipboard, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import openapi from "../generated/openapi.json";
import { apiUrl, publicApiLabel } from "../lib/api";

type Operation = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  security?: Array<Record<string, unknown>>;
  requestBody?: { content?: Record<string, { schema?: { $ref?: string; type?: string } }> };
  responses?: Record<string, { description?: string }>;
};

type Endpoint = Operation & { method: string; path: string };

const methods = ["get", "post", "put", "patch", "delete"];
const spec = openapi as unknown as {
  info: { title: string; version: string; description?: string };
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, unknown> };
};

const endpoints: Endpoint[] = Object.entries(spec.paths).flatMap(([path, pathItem]) =>
  methods.flatMap((method) => pathItem[method] ? [{ ...pathItem[method], method, path }] : []),
);

function requestBodyName(operation: Operation): string | null {
  const schema = operation.requestBody?.content?.["application/json"]?.schema;
  return schema?.$ref?.split("/").at(-1) ?? schema?.type ?? null;
}

function CurlButton({ endpoint }: { endpoint: Endpoint }) {
  const [copied, setCopied] = useState(false);
  const secured = Boolean(endpoint.security?.length);
  const bodyName = requestBodyName(endpoint);
  const value = [
    `curl -X ${endpoint.method.toUpperCase()} "${apiUrl(endpoint.path)}"`,
    secured ? '  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"' : null,
    bodyName ? '  -H "Content-Type: application/json"' : null,
    bodyName ? `  -d '{"replace":"with ${bodyName} fields"}'` : null,
  ].filter(Boolean).join(" \\\n");

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return <button className="mini-action" type="button" onClick={copy}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copied" : "Copy cURL"}</button>;
}

export function ApiReference() {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [probe, setProbe] = useState<string | null>(null);
  const tags = useMemo(() => Array.from(new Set(endpoints.flatMap((item) => item.tags ?? []))).sort(), []);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return endpoints.filter((endpoint) => {
      const matchesTag = tag === "all" || endpoint.tags?.includes(tag);
      const haystack = `${endpoint.method} ${endpoint.path} ${endpoint.summary ?? ""} ${endpoint.operationId ?? ""}`.toLowerCase();
      return matchesTag && (!term || haystack.includes(term));
    });
  }, [query, tag]);

  const testHealth = async (path: string) => {
    setProbe("Checking…");
    try {
      const response = await fetch(apiUrl(path), { cache: "no-store" });
      const payload = await response.json();
      setProbe(JSON.stringify(payload, null, 2));
    } catch {
      setProbe("The API could not be reached. Verify VITE_API_URL and API CORS settings.");
    }
  };

  return (
    <div className="api-reference">
      <div className="api-summary-grid">
        <div><strong>{endpoints.length}</strong><span>operations</span></div>
        <div><strong>{tags.length}</strong><span>resource groups</span></div>
        <div><strong>{Object.keys(spec.components?.schemas ?? {}).length}</strong><span>schemas</span></div>
        <div><strong>v{spec.info.version}</strong><span>contract version</span></div>
      </div>
      <aside className="callout success"><strong>Generated source of truth</strong><p>This page is generated from <code>lib/api-spec/openapi.yaml</code> before every development session and production build.</p></aside>
      <div className="api-tools">
        <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search path, operation, or purpose…" /></label>
        <select value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter API tag"><option value="all">All resources</option>{tags.map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      <div className="server-row"><span>Server</span><code>{publicApiLabel()}/api</code><a href={apiUrl("/healthz")} target="_blank" rel="noreferrer">Health endpoint <ExternalLink size={13} /></a></div>
      <div className="endpoint-list">
        {visible.map((endpoint) => {
          const key = `${endpoint.method}:${endpoint.path}`;
          const secured = Boolean(endpoint.security?.length);
          return <article className={`endpoint-card ${expanded === key ? "expanded" : ""}`} key={key}>
            <button className="endpoint-head" type="button" onClick={() => setExpanded(expanded === key ? null : key)}>
              <b className={`method ${endpoint.method}`}>{endpoint.method}</b><code>{endpoint.path}</code><span>{endpoint.summary ?? endpoint.operationId}</span>{secured && <ShieldCheck size={15} aria-label="Authentication required" />}<ChevronDown size={16} />
            </button>
            {expanded === key && <div className="endpoint-detail">
              {endpoint.description && <p>{endpoint.description}</p>}
              <dl><div><dt>Operation</dt><dd>{endpoint.operationId ?? "—"}</dd></div><div><dt>Authorization</dt><dd>{secured ? "Bearer token required" : "Public"}</dd></div><div><dt>JSON body</dt><dd>{requestBodyName(endpoint) ?? "None"}</dd></div></dl>
              <div className="response-chips">{Object.entries(endpoint.responses ?? {}).map(([code, response]) => <span key={code}><b>{code}</b>{response.description ?? "Response"}</span>)}</div>
              <div className="endpoint-actions"><CurlButton endpoint={endpoint} />{endpoint.method === "get" && ["/healthz", "/livez"].includes(endpoint.path) && <button className="mini-action" type="button" onClick={() => testHealth(endpoint.path)}>Run safe check</button>}</div>
              {probe && ["/healthz", "/livez"].includes(endpoint.path) && <pre className="probe-result">{probe}</pre>}
            </div>}
          </article>;
        })}
      </div>
      {!visible.length && <div className="empty-state">No API operations match those filters.</div>}
    </div>
  );
}
