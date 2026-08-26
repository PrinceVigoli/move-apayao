import { CalendarDays, CheckCircle2, GitCommitHorizontal } from "lucide-react";

const releases = [
  { version: "1.1.0", date: "2026-08-26", current: true, title: "Operational documentation platform", changes: ["Generated interactive OpenAPI reference", "API-protected developer and superadmin runbooks", "Live dependency status page", "English, Filipino, and Ilocano rider/driver quick guides", "Clean static routes and automatic GitHub Pages deployment", "Visual booking, approval, fare, and GIS walkthroughs"] },
  { version: "1.0.0", date: "2026-08-25", current: false, title: "Initial public documentation", changes: ["Platform and local-development overview", "Passenger, driver, dashboard, maps, email, IoT, deployment, and security guides", "Responsive documentation search and navigation"] },
];

export function ReleaseNotes() {
  return <div className="release-list">{releases.map((release) => <article key={release.version} className={release.current ? "current" : ""}><div className="release-rail"><GitCommitHorizontal /><span /></div><div className="release-content"><div className="release-meta"><b>v{release.version}</b>{release.current && <em>Current</em>}<span><CalendarDays size={14} />{release.date}</span></div><h2>{release.title}</h2><ul>{release.changes.map((change) => <li key={change}><CheckCircle2 size={16} />{change}</li>)}</ul></div></article>)}</div>;
}
