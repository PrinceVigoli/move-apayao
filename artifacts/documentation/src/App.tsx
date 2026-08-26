import {
  Activity,
  ArrowRight,
  BookOpen,
  CarFront,
  Check,
  ChevronRight,
  CircleUserRound,
  Clipboard,
  Cloud,
  Code2,
  Database,
  ExternalLink,
  FileKey2,
  Gauge,
  GitBranch,
  KeyRound,
  Languages,
  Mail,
  Map,
  Menu,
  RadioTower,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiReference } from "./components/ApiReference";
import { InternalRunbooks } from "./components/InternalRunbooks";
import { LanguageGuides } from "./components/LanguageGuides";
import { ReleaseNotes } from "./components/ReleaseNotes";
import { SystemStatus } from "./components/SystemStatus";
import { WorkflowGuide } from "./components/WorkflowGuide";

type DocId =
  | "overview"
  | "local-setup"
  | "passenger"
  | "driver"
  | "dashboard"
  | "maps-gis"
  | "email"
  | "iot-gps"
  | "api-reference"
  | "system-status"
  | "language-guides"
  | "releases"
  | "deployment"
  | "security"
  | "internal-runbooks";

type Category = "Start here" | "Applications" | "Platform" | "Operations";

type Section = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  steps?: Array<[string, string]>;
  code?: string;
  callout?: { title: string; text: string; tone?: "note" | "warning" | "success" };
  table?: { headings: string[]; rows: string[][] };
};

type Page = {
  id: DocId;
  category: Category;
  title: string;
  summary: string;
  icon: LucideIcon;
  keywords: string;
  sections: Section[];
  lastUpdated?: string;
};

const pages: Page[] = [
  {
    id: "overview",
    category: "Start here",
    title: "Platform overview",
    summary: "Understand the MOVE Apayao pilot, its services, and how data moves through the system.",
    icon: BookOpen,
    keywords: "architecture postgres redis api pilot services",
    sections: [
      {
        title: "One mobility platform",
        paragraphs: [
          "MOVE Apayao connects the passenger app, driver app, operations dashboard, and public landing site to one authenticated API. The initial pilot is point-to-point and follows the approved Pudtol–Payanan loop.",
        ],
        bullets: [
          "Passenger — booking, pickup PIN, live vehicle tracking, trip history, and feedback.",
          "Driver — shift control, ride requests, navigation, trip states, and GPS telemetry.",
          "Dashboard — approvals, fleet monitoring, fares, incidents, analytics, and audit logs.",
          "API + GIS — authentication, dispatch, PostGIS history, route intelligence, and notifications.",
        ],
      },
      {
        title: "Core infrastructure",
        bullets: [
          "Postgres + PostGIS stores accounts, bookings, fares, GPS history, routes, and audit records.",
          "Redis supports dispatch, current positions, event streaming, caching, and shared rate limits.",
          "GIS Intelligence creates review-only route candidates from quality-controlled driver traces.",
          "Transactional email delivers password resets and driver application decisions through SMTP.",
        ],
        callout: {
          title: "Pilot rule",
          text: "GIS analysis never changes a published passenger route automatically. A developer or superadmin must review route changes.",
          tone: "success",
        },
      },
    ],
  },
  {
    id: "local-setup",
    category: "Start here",
    title: "Local development",
    summary: "Start the data layer, APIs, websites, GIS service, and mobile development clients.",
    icon: Code2,
    keywords: "install docker pnpm dev ngrok terminals local",
    sections: [
      {
        title: "Prerequisites and data",
        paragraphs: ["Install Node.js 22.13 or newer, pnpm 11.17, Docker Desktop, and ngrok. Run these commands from the repository root."],
        code: [
          "pnpm.cmd install --frozen-lockfile",
          "docker compose up -d db redis",
          "pnpm.cmd --filter @workspace/db run push",
        ].join("\n"),
      },
      {
        title: "Run the services",
        paragraphs: ["Open a separate VS Code terminal for each long-running process."],
        code: [
          "# API — port 5000",
          "pnpm.cmd --filter @workspace/api-server run dev",
          "",
          "# Private GIS — port 5100",
          "pnpm.cmd --filter @workspace/gis-service run dev",
          "",
          "# Dashboard / landing / documentation",
          "pnpm.cmd --filter @workspace/dashboard run dev",
          "pnpm.cmd --filter @workspace/landing run dev",
          "pnpm.cmd --filter @workspace/documentation run dev",
        ].join("\n"),
      },
      {
        title: "Mobile development clients",
        code: [
          "# Passenger Metro",
          "pnpm.cmd --filter @workspace/mobile run dev -- --port 8081 --clear",
          "",
          "# Driver Metro",
          "pnpm.cmd --filter @workspace/driver run dev -- --port 8082 --clear",
        ].join("\n"),
        callout: {
          title: "Physical phones",
          text: "Use a LAN IP or a working HTTPS tunnel for EXPO_PUBLIC_API_URL. A phone cannot use your computer's localhost.",
        },
      },
    ],
  },
  {
    id: "passenger",
    category: "Applications",
    title: "Passenger app",
    summary: "Account creation, point-to-point booking, tracking, pickup verification, and feedback.",
    icon: CircleUserRound,
    keywords: "rider signup booking pickup pin rating feedback tracking",
    sections: [
      {
        title: "Passenger journey",
        steps: [
          ["Create an account", "Register with a valid email, unique phone number, and password of at least eight characters."],
          ["Choose both points", "Select pickup and destination inside the pilot area. The API validates the route and previews fare."],
          ["Confirm booking", "The request enters dispatch and is offered only to eligible drivers with enough capacity."],
          ["Track the vehicle", "The app shows the assigned driver, vehicle, live position, and current trip state."],
          ["Verify and rate", "The pickup PIN protects boarding. After completion, submit a 1–5 rating and optional feedback."],
        ],
      },
      {
        title: "Account recovery",
        paragraphs: ["Forgot password sends a one-time link that expires after one hour. A successful reset revokes existing sessions and invalidates older reset links."],
        steps: [
          ["Request the link", "Enter the registered email on Forgot password. The response never reveals whether an account exists."],
          ["Open the newest email", "Use only the latest reset message and confirm that the link uses the official HTTPS domain."],
          ["Set a new password", "Choose a new password of at least eight characters; the link becomes unusable immediately."],
          ["Sign in again", "All previous sessions are revoked, so authenticate again on each trusted device."],
        ],
        callout: {
          title: "Privacy",
          text: "Passengers never receive driver authentication data. Future calling should use a protected relay or masked number.",
        },
      },
    ],
  },
  {
    id: "driver",
    category: "Applications",
    title: "Driver app",
    summary: "Application approval, shift control, ride lifecycle, and offline-aware location reporting.",
    icon: CarFront,
    keywords: "driver approval shift ride gps location background",
    sections: [
      {
        title: "Access and approval",
        paragraphs: ["Public driver registration creates a driver applicant. It does not grant operational access. An administrator reviews licence and vehicle details before approval."],
        bullets: ["Pending → Approved → On shift → Available → On trip", "Rejection and later revocation require a documented reason."],
      },
      {
        title: "Trip lifecycle",
        steps: [
          ["Receive request", "Only an approved, on-shift, available driver can receive work."],
          ["Accept and navigate", "Acceptance reserves the driver and vehicle, then opens pickup guidance."],
          ["Arrive and verify", "The driver marks arrival and enters the passenger's pickup PIN before starting."],
          ["Complete", "Completion records fare, duration, distance, capacity usage, and final state."],
        ],
      },
      {
        title: "Dual GPS design",
        paragraphs: ["The smartphone remains the interactive source for booking and navigation. A future vehicle IoT tracker supplies independent telemetry and buffers points when cellular service is unavailable."],
        callout: {
          title: "Background location",
          text: "Smartphone location collection should stop when the driver ends the shift. Vehicle IoT tracking follows its separately documented operating policy.",
          tone: "warning",
        },
      },
    ],
  },
  {
    id: "dashboard",
    category: "Applications",
    title: "Operations dashboard",
    summary: "Roles, driver decisions, fleet monitoring, fares, analytics, incidents, and auditability.",
    icon: Gauge,
    keywords: "admin superadmin developer fare analytics audit fleet approval",
    sections: [
      {
        title: "Role boundaries",
        table: {
          headings: ["Role", "Operational scope"],
          rows: [
            ["Provincial admin", "Daily operations, driver review, trips, fares, incidents, users, and audit views."],
            ["Superadmin", "Provincial capabilities plus restricted platform administration and GIS access."],
            ["Developer", "Technical monitoring, GIS intelligence, integration health, and diagnostics."],
          ],
        },
      },
      {
        title: "Account decisions",
        paragraphs: ["Pending driver applications can be approved or rejected with documentation. Approved access can later be revoked with a required reason. Revocation is preferable to deletion because the decision remains auditable."],
      },
      {
        title: "Planning and analytics",
        paragraphs: ["Analytics combines demand by hour and location, completed versus cancelled bookings, passenger headcount, vehicle utilization, revenue, route performance, wait time, incidents, and reliability. Authorized staff—not charts—make planning decisions."],
      },
      {
        title: "Configure the fare policy",
        steps: [
          ["Review the active policy", "Record the current base fare, included distance, per-kilometre rate, minimum fare, and effective date."],
          ["Enter the approved matrix", "Use only values approved for the pilot; preview representative short and long trips before saving."],
          ["Publish with an effective date", "Do not rewrite historical trip fares. New policy values apply only according to the configured effective date."],
          ["Verify and monitor", "Book a controlled test trip, compare the quoted and recorded fare, then watch audit logs and fare analytics."],
        ],
      },
    ],
  },
  {
    id: "maps-gis",
    category: "Platform",
    title: "Maps and GIS",
    summary: "Google key separation, road routing, caching, GPS quality, and route intelligence.",
    icon: Map,
    keywords: "google android ios javascript places routes postgis redis key",
    sections: [
      {
        title: "Use separate platform keys",
        table: {
          headings: ["Consumer", "Application restriction", "API restriction"],
          rows: [
            ["Android apps", "Package name + signing SHA-1", "Maps SDK for Android"],
            ["iOS apps", "Bundle identifier", "Maps SDK for iOS"],
            ["Websites", "Exact HTTPS referrers", "Maps JavaScript API"],
            ["API server", "Server/network restriction", "Only required Places and Routes services"],
          ],
        },
        callout: {
          title: "Never publish server credentials",
          text: "Mobile and browser keys are visible to clients and must be tightly restricted. Server keys remain in server-side secret storage.",
          tone: "warning",
        },
      },
      {
        title: "Route intelligence and caching",
        paragraphs: [
          "PostGIS retains timestamped driver traces. Quality rules remove impossible speeds, low-accuracy points, stale samples, and fragmented runs. Repeated corridors from multiple drivers may become review candidates.",
          "Redis caches server-side route and place results where provider terms permit. It does not eliminate client map loads or bypass Google billing.",
        ],
      },
      {
        title: "Review a GIS route candidate",
        steps: [
          ["Check evidence quality", "Confirm the candidate meets the minimum valid-run and multi-driver thresholds and has no unresolved quality flags."],
          ["Compare the road corridor", "Inspect the candidate against satellite/street map detail, approved stops, known road restrictions, and the existing published route."],
          ["Document the decision", "Record why the candidate is accepted, held, or rejected and preserve the contributing trace references."],
          ["Publish deliberately", "A developer or superadmin publishes only after operational approval; analysis never edits the passenger route automatically."],
        ],
      },
    ],
  },
  {
    id: "email",
    category: "Platform",
    title: "Email and password reset",
    summary: "Configure Brevo SMTP, verify senders, and test one-time account-recovery links.",
    icon: Mail,
    keywords: "brevo smtp nodemailer reset email sender tls",
    sections: [
      {
        title: "Recommended pilot configuration",
        paragraphs: ["The Node API uses Nodemailer and Brevo supplies the SMTP relay. PHP and PHPMailer are not required."],
        code: [
          "SMTP_HOST=smtp-relay.brevo.com",
          "SMTP_PORT=587",
          "SMTP_USER=YOUR_BREVO_SMTP_LOGIN",
          "SMTP_PASS=YOUR_BREVO_SMTP_KEY",
          "SMTP_FROM=\"MOVE Apayao <YOUR_VERIFIED_SENDER_EMAIL>\"",
          "PASSWORD_RESET_URL_BASE=https://YOUR-PUBLIC-DOMAIN/reset-password",
        ].join("\n"),
      },
      {
        title: "Setup and verification",
        steps: [
          ["Verify a sender", "Confirm ownership in Brevo. Authenticate the production domain with SPF, DKIM, and DMARC."],
          ["Create an SMTP key", "Use an SMTP key—not the Brevo account password or a REST API key."],
          ["Store server secrets", "Keep SMTP values in the API environment, never in EXPO_PUBLIC or VITE variables."],
          ["Restart and test", "Request a reset, check inbox and spam, and verify that the link works only once."],
        ],
        callout: {
          title: "Changing ngrok URLs",
          text: "Update PASSWORD_RESET_URL_BASE, restart the API, and request a new link whenever the public tunnel address changes.",
        },
      },
    ],
  },
  {
    id: "iot-gps",
    category: "Platform",
    title: "IoT vehicle GPS",
    summary: "Prepare hardware-neutral tracker provisioning without removing smartphone location.",
    icon: RadioTower,
    keywords: "tracker telemetry device offline buffer vehicle smartphone",
    sections: [
      {
        title: "Two sources, different duties",
        bullets: [
          "Driver smartphone — booking interaction, navigation, shift intent, and permission-aware updates.",
          "Vehicle tracker — independent position, store-and-forward telemetry, device health, and vehicle identity.",
        ],
      },
      {
        title: "Hardware onboarding",
        steps: [
          ["Inspect protocol", "Confirm HTTP, MQTT or TCP format, authentication, SIM needs, and buffered uploads."],
          ["Provision identity", "Give every tracker a unique, revocable credential. Never store a driver's password."],
          ["Assign the vehicle", "Maintain assignment history so earlier telemetry remains attributable."],
          ["Field test", "Validate timestamps, accuracy, dead-zone buffering, replay protection, and clock drift."],
        ],
        callout: {
          title: "Keep smartphone GPS",
          text: "IoT telemetry complements the driver phone; it does not replace the app context required by booking and navigation.",
          tone: "success",
        },
      },
    ],
  },
  {
    id: "api-reference",
    category: "Platform",
    title: "API reference",
    summary: "Search the generated API contract, inspect authorization and responses, and copy safe request examples.",
    icon: Database,
    keywords: "openapi api endpoint schema curl bearer generated interactive",
    sections: [],
    lastUpdated: "2026-08-26",
  },
  {
    id: "system-status",
    category: "Operations",
    title: "System status",
    summary: "Check API readiness and the current state of Postgres, Redis, GIS, and Google routing configuration.",
    icon: Activity,
    keywords: "status health availability database redis gis maps operational",
    sections: [],
    lastUpdated: "2026-08-26",
  },
  {
    id: "language-guides",
    category: "Applications",
    title: "Language guides",
    summary: "Passenger and driver pilot instructions in English, Filipino, and Ilocano.",
    icon: Languages,
    keywords: "translation Filipino Tagalog Ilocano passenger driver guide",
    sections: [],
    lastUpdated: "2026-08-26",
  },
  {
    id: "releases",
    category: "Start here",
    title: "Releases",
    summary: "Track documentation versions, publication dates, and the operational changes included in each release.",
    icon: GitBranch,
    keywords: "version changelog release notes updated history",
    sections: [],
    lastUpdated: "2026-08-26",
  },
  {
    id: "deployment",
    category: "Operations",
    title: "Deployment",
    summary: "Publish static sites, deploy private services, configure DNS, TLS, secrets, and health checks.",
    icon: Cloud,
    keywords: "production dns domain documentation static hosting tls",
    sections: [
      {
        title: "Documentation subdomain",
        paragraphs: ["Build this app as a static site and map a subdomain such as documentation.moveapayao.gov.ph to the hosting provider."],
        code: [
          "pnpm.cmd --filter @workspace/documentation run build",
          "# Static output: artifacts/documentation/dist",
        ].join("\n"),
        steps: [
          ["Create a static site", "Use the repository root as source, the command above, and artifacts/documentation/dist as output."],
          ["Attach the domain", "Add documentation.moveapayao.gov.ph in the hosting dashboard."],
          ["Create DNS", "Use the exact CNAME or A/ALIAS target supplied by the provider."],
          ["Confirm HTTPS", "Wait for DNS propagation and provider-managed TLS before publishing links."],
        ],
      },
      {
        title: "Service boundaries",
        bullets: [
          "Landing, dashboard, and documentation are static-site deployments.",
          "The API and GIS service run as server processes; GIS stays private.",
          "Postgres/PostGIS, Redis, and Adminer must never be exposed as website ports.",
          "Production secrets belong in encrypted hosting environment settings.",
        ],
      },
    ],
  },
  {
    id: "security",
    category: "Operations",
    title: "Security checklist",
    summary: "Protect credentials, roles, sessions, maps usage, infrastructure, and operational records.",
    icon: ShieldCheck,
    keywords: "secrets api key role password session audit cors checklist",
    sections: [
      {
        title: "Before every public test",
        bullets: [
          "Rotate credentials exposed in chat, screenshots, logs, or source control.",
          "Restrict Google keys by platform and by only the APIs each key needs.",
          "Use HTTPS for every public API, dashboard, documentation site, and reset link.",
          "Keep Postgres, Redis, Adminer, and the GIS service private.",
          "Allow only exact browser origins in API CORS configuration.",
          "Use unique JWT, GIS, device, SMTP, and database secrets.",
          "Require reasons for rejection or revocation and preserve audit records.",
          "Test reset links, session revocation, backups, and degraded dependencies.",
        ],
      },
      {
        title: "Public documentation boundary",
        paragraphs: ["Published documentation can explain workflows and variable names, but must never contain real API keys, SMTP passwords, JWT secrets, database credentials, GIS tokens, signing files, test passwords, or unredacted personal data."],
        callout: {
          title: "Treat mobile keys as public",
          text: "A native app contains its Maps key. Security comes from package/SHA-1 or bundle restrictions, not from assuming the key cannot be extracted.",
          tone: "warning",
        },
      },
    ],
  },
  {
    id: "internal-runbooks",
    category: "Operations",
    title: "Internal runbooks",
    summary: "API-protected incident, rollback, recovery, credential, GIS, and IoT procedures for developers and superadmins.",
    icon: KeyRound,
    keywords: "private restricted developer superadmin runbook incident rollback backup rotation",
    sections: [],
    lastUpdated: "2026-08-26",
  },
];

const categories: Category[] = ["Start here", "Applications", "Platform", "Operations"];

const basePath = new URL(import.meta.env.BASE_URL, window.location.origin).pathname;

function routeFor(id: DocId): string {
  const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return id === "overview" ? prefix : `${prefix}${id}`;
}

function currentId(): DocId {
  const legacyHash = window.location.hash.replace(/^#\/?/, "");
  const withoutBase = window.location.pathname.startsWith(basePath)
    ? window.location.pathname.slice(basePath.length)
    : window.location.pathname;
  const requested = (legacyHash || withoutBase.replace(/^\/+|\/+$/g, "").split("/")[0]) as DocId;
  return pages.some((page) => page.id === requested) ? requested : "overview";
}

function PageContent({ page }: { page: Page }) {
  return <>
    {(page.id === "passenger" || page.id === "driver" || page.id === "dashboard") && <WorkflowGuide kind={page.id} />}
    {page.id === "api-reference" && <ApiReference />}
    {page.id === "system-status" && <SystemStatus />}
    {page.id === "language-guides" && <LanguageGuides />}
    {page.id === "releases" && <ReleaseNotes />}
    {page.id === "internal-runbooks" && <InternalRunbooks />}
    {page.sections.map((section) => <DocSection key={section.title} section={section} />)}
  </>;
}

function CodeBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="code-block">
      <div className="code-toolbar"><span>Configuration</span><button type="button" onClick={copy}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copied" : "Copy"}</button></div>
      <pre><code>{value}</code></pre>
    </div>
  );
}

function DocSection({ section }: { section: Section }) {
  return (
    <section className="doc-section">
      <h2>{section.title}</h2>
      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.bullets && <ul className="feature-list">{section.bullets.map((bullet) => <li key={bullet}><ShieldCheck size={18} /><span>{bullet}</span></li>)}</ul>}
      {section.table && <div className="table-wrap"><table><thead><tr>{section.table.headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{section.table.rows.map((row) => <tr key={row.join(":")} >{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>}
      {section.code && <CodeBlock value={section.code} />}
      {section.steps && <ol className="steps">{section.steps.map(([title, text], index) => <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol>}
      {section.callout && <aside className={`callout ${section.callout.tone ?? "note"}`}><strong>{section.callout.title}</strong><p>{section.callout.text}</p></aside>}
    </section>
  );
}

export function App() {
  const [activeId, setActiveId] = useState<DocId>(currentId);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const sync = () => setActiveId(currentId());
    if (window.location.hash) window.history.replaceState(null, "", routeFor(currentId()));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const activeIndex = pages.findIndex((page) => page.id === activeId);
  const active = pages[activeIndex] ?? pages[0];
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term
      ? pages.filter((page) => `${page.title} ${page.summary} ${page.keywords}`.toLowerCase().includes(term))
      : [];
  }, [query]);

  const navigate = (id: DocId) => {
    window.history.pushState(null, "", routeFor(id));
    setActiveId(id);
    setQuery("");
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    document.title = `${active.title} · MOVE Apayao Documentation`;
  }, [active.title]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="mobile-menu" type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu /></button>
        <a className="brand" href={routeFor("overview")} onClick={(event) => { event.preventDefault(); navigate("overview"); }}>
          <span className="brand-mark"><Map size={20} /></span>
          <span><strong>MOVE <em>Apayao</em></strong><small>Documentation</small></span>
        </a>
        <div className="top-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation…" aria-label="Search documentation" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>}
          {query && <div className="search-results">{results.length ? results.map((page) => <button type="button" key={page.id} onClick={() => navigate(page.id)}><page.icon size={17} /><span><strong>{page.title}</strong><small>{page.summary}</small></span><ArrowRight size={15} /></button>) : <p>No documentation matched “{query}”.</p>}</div>}
        </div>
        <a className="site-link" href={import.meta.env.VITE_PRODUCT_URL ?? "http://localhost:5175"}>MOVE website <ExternalLink size={14} /></a>
      </header>

      {menuOpen && <button className="scrim" type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-mobile-head"><span>Documentation</span><button type="button" onClick={() => setMenuOpen(false)}><X /></button></div>
        <button className="version-pill" type="button" onClick={() => navigate("releases")} title="Open release notes"><span /> Pilot documentation <b>v1.1</b></button>
        <nav>{categories.map((category) => <section key={category}><h2>{category}</h2>{pages.filter((page) => page.category === category).map((page) => <button type="button" className={page.id === active.id ? "active" : ""} key={page.id} onClick={() => navigate(page.id)}><page.icon size={17} /><span>{page.title}</span><ChevronRight size={14} /></button>)}</section>)}</nav>
        <div className="sidebar-foot"><ShieldCheck size={17} /><span><strong>Public-safe docs</strong><small>No credentials or personal data</small></span></div>
      </aside>

      <main className="content">
        <div className="breadcrumbs"><span>MOVE Apayao</span><ChevronRight size={14} /><span>{active.category}</span></div>
        <header className="doc-hero"><div className="hero-icon"><active.icon /></div><p>{active.category}</p><h1>{active.title}</h1><div>{active.summary}</div></header>
        <article className="doc-body"><PageContent page={active} /></article>
        <footer className="doc-pagination">
          {activeIndex > 0 ? <button type="button" onClick={() => navigate(pages[activeIndex - 1].id)}><small>Previous</small><span>← {pages[activeIndex - 1].title}</span></button> : <span />}
          {activeIndex < pages.length - 1 && <button className="next" type="button" onClick={() => navigate(pages[activeIndex + 1].id)}><small>Next</small><span>{pages[activeIndex + 1].title} →</span></button>}
        </footer>
        <div className="updated"><FileKey2 size={15} /> Last updated {active.lastUpdated ?? "2026-08-26"} · Review before every release</div>
      </main>
    </div>
  );
}
