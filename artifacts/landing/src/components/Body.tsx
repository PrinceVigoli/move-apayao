import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  CloudRain,
  Download,
  ExternalLink,
  FileSpreadsheet,
  History,
  Leaf,
  Mail,
  MapPin,
  Navigation,
  Radio,
  ShieldCheck,
  Star,
  TriangleAlert,
  Users,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  coverage,
  drivers,
  faqs,
  features,
  footer,
  links,
  publicContact,
  storesAreLive,
  stakeholders,
} from "@/content/site";
import { BrandLockup } from "@/components/Brand";
import { CoverageMap } from "@/components/CoverageMap";
import { Reveal } from "@/components/Motion";
import { RouteStrip } from "@/components/RouteStrip";
import { useFeaturedLoop } from "@/lib/loops";

const ICONS: Record<string, LucideIcon> = {
  MapPin,
  Users,
  History,
  CloudRain,
  TriangleAlert,
  Star,
};

const PARTNER_METRICS = [
  { icon: Radio, value: "Live", label: "Fleet status" },
  { icon: BarChart3, value: "Daily", label: "Service insights" },
  { icon: FileSpreadsheet, value: "CSV", label: "Report exports" },
  { icon: ShieldCheck, value: "Trip-linked", label: "Incident records" },
];

export function Coverage() {
  const { data: featuredLoop, isLoading, error } = useFeaturedLoop();

  return (
    <section
      id="coverage"
      className="section-space overflow-hidden bg-muted/45"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <Reveal>
            <p className="eyebrow text-primary">{coverage.eyebrow}</p>
            <h2 className="display mt-4 max-w-xl text-4xl sm:text-5xl">
              Serving Pudtol today.{" "}
              <span className="text-primary">Growing with Apayao.</span>
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
              {coverage.body}
            </p>

            <dl className="coverage-stats mt-10 grid grid-cols-3 gap-3">
              {coverage.stats.map((stat) => (
                <div key={stat.label} className="stat-card">
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-8 flex gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
              <Leaf size={19} className="mt-0.5 shrink-0 text-primary" />
              {coverage.caveat}
            </p>
          </Reveal>

          <Reveal delay={100} className="relative">
            <div className="map-glow" aria-hidden="true" />
            <div className="coverage-shell">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
                <div>
                  <p className="eyebrow text-primary">Live coverage</p>
                  <h3 className="mt-1 text-xl font-bold">
                    {isLoading
                      ? "Loading active loop..."
                      : (featuredLoop?.route.name ?? "No active loop")}
                  </h3>
                </div>
                <span className="live-badge">
                  <span />{" "}
                  {error
                    ? "Route unavailable"
                    : featuredLoop
                      ? "Published route"
                      : "Not configured"}
                </span>
              </div>
              <CoverageMap loop={featuredLoop} />
              <div className="bg-background px-5 py-5 sm:px-6">
                <RouteStrip tone="light" loop={featuredLoop} />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section className="section-space bg-background">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-3xl">
          <p className="eyebrow text-primary">What the app does</p>
          <h2 className="display mt-4 text-4xl sm:text-5xl">
            Everything you need for a{" "}
            <span className="text-primary">confident local ride.</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = ICONS[feature.icon] ?? MapPin;
            return (
              <Reveal key={feature.title} delay={(index % 3) * 80}>
                <article className="feature-card group">
                  <span className="feature-icon">
                    <Icon size={21} />
                  </span>
                  <span className="feature-index">0{index + 1}</span>
                  <h3 className="mt-9 text-lg font-bold">{feature.title}</h3>
                  <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
                    {feature.body}
                  </p>
                  <span className="feature-line" aria-hidden="true" />
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Drivers() {
  return (
    <section id="drivers" className="section-space bg-background pt-0">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="driver-panel">
            <img
              src="/images/move-apayao-driver.webp"
              alt="A MOVE Apayao e-trike driver standing beside his vehicle on a mountain road"
              className="driver-image"
              loading="lazy"
            />
            <div className="driver-wash" aria-hidden="true" />
            <div
              className="topo-pattern topo-pattern-dark"
              aria-hidden="true"
            />

            <div className="driver-content relative z-10 max-w-2xl px-6 py-14 sm:px-12 sm:py-20 lg:px-16 lg:py-24">
              <p className="eyebrow text-accent">{drivers.eyebrow}</p>
              <h2 className="display mt-4 text-4xl text-white sm:text-5xl">
                Built for drivers.{" "}
                <span className="text-accent">
                  Designed for mountain journeys.
                </span>
              </h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/68">
                {drivers.body}
              </p>

              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {drivers.points.map((point) => (
                  <li key={point} className="driver-point">
                    <span>
                      <Check size={13} strokeWidth={3} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>

              <div className="driver-actions mt-9 flex flex-wrap items-center gap-4">
                <a href={links.driverAndroid} className="button button-accent">
                  {drivers.cta}
                  <ArrowRight size={17} />
                </a>
                <p className="max-w-[210px] text-xs leading-5 text-white/55">
                  {drivers.note}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Stakeholders() {
  return (
    <section
      id="partners"
      className="section-space overflow-hidden bg-foreground text-white"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
          <Reveal>
            <p className="eyebrow text-accent">{stakeholders.eyebrow}</p>
            <h2 className="display mt-4 text-4xl sm:text-5xl">
              {stakeholders.title}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/65">
              {stakeholders.body}
            </p>
            {links.dashboard && (
              <a href={links.dashboard} className="button button-light mt-9">
                {stakeholders.cta}
                <ArrowRight size={17} />
              </a>
            )}
          </Reveal>

          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PARTNER_METRICS.map((metric, index) => (
                <Reveal key={metric.label} delay={index * 70}>
                  <div className="partner-metric">
                    <metric.icon size={18} />
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="mt-4 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2">
              {stakeholders.items.map((item, index) => (
                <Reveal key={item.title} delay={(index % 2) * 70}>
                  <article className="partner-card">
                    <span>0{index + 1}</span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="section-space bg-muted/45">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr]">
        <Reveal>
          <p className="eyebrow text-primary">Questions</p>
          <h2 className="display mt-4 text-4xl sm:text-5xl">
            Before you ride.
          </h2>
          <p className="mt-5 max-w-sm leading-7 text-muted-foreground">
            Straight answers about fares, coverage, data, and joining the MOVE
            Apayao driver community.
          </p>
          <div className="mt-8 flex items-center gap-3 text-sm font-semibold text-primary">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10">
              <Navigation size={18} />
            </span>
            Local support for every journey
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="faq-list">
            {faqs.map((faq, index) => {
              const isOpen = open === index;
              const panelId = `faq-panel-${index}`;
              return (
                <article
                  key={faq.q}
                  className={`faq-item ${isOpen ? "is-open" : ""}`}
                >
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : index)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                    >
                      <span>{faq.q}</span>
                      <ChevronDown size={18} />
                    </button>
                  </h3>
                  <div
                    id={panelId}
                    className="faq-answer-grid"
                    style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                  >
                    <div>
                      <p>{faq.a}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Contact() {
  return (
    <section id="contact" className="section-space bg-background">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="contact-panel">
            <div>
              <p className="eyebrow text-primary">Contact and support</p>
              <h2 className="display mt-4 max-w-xl text-4xl sm:text-5xl">
                A local team behind every trip.
              </h2>
              <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
                Ask about pilot access, driver applications, bookings,
                incidents, or your personal data. Never send a password or
                one-time code by email.
              </p>
            </div>
            <div className="contact-grid">
              <a href={links.email} className="contact-card">
                <span>
                  <Mail size={20} />
                </span>
                <small>Service support</small>
                <strong>{publicContact.supportEmail}</strong>
              </a>
              {links.phone ? (
                <a href={links.phone} className="contact-card">
                  <span>
                    <Phone size={20} />
                  </span>
                  <small>Phone</small>
                  <strong>{publicContact.phone}</strong>
                </a>
              ) : (
                <div className="contact-card">
                  <span>
                    <Building2 size={20} />
                  </span>
                  <small>Visit</small>
                  <strong>{publicContact.address}</strong>
                </div>
              )}
              <a
                href={links.officialWebsite}
                target="_blank"
                rel="noreferrer"
                className="contact-card"
              >
                <span>
                  <ExternalLink size={20} />
                </span>
                <small>Official LGU website</small>
                <strong>lgupudtol.ph</strong>
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-background">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <Reveal>
          <div id="download" className="download-banner">
            <div>
              <p className="eyebrow text-accent">Ready when you are</p>
              <h2 className="display mt-3 text-3xl text-white sm:text-4xl">
                Move through Apayao with confidence.
              </h2>
            </div>
            <div className="download-actions flex flex-wrap gap-3">
              <a href={links.passengerAndroid} className="button button-accent">
                <Download size={17} />{" "}
                {storesAreLive ? "Passenger app" : "Passenger pilot access"}
              </a>
              <a
                href={links.driverAndroid}
                className="button button-dark-outline"
              >
                {storesAreLive ? "Driver app" : "Driver pilot access"}{" "}
                <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </Reveal>

        <div className="grid gap-10 py-14 md:grid-cols-[1.25fr_0.75fr_0.75fr_0.75fr]">
          <div>
            <BrandLockup />
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">
              {footer.support}
            </p>
          </div>

          <div>
            <p className="eyebrow text-foreground">Explore</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#how">How it works</a>
              </li>
              <li>
                <a href="#coverage">Coverage</a>
              </li>
              <li>
                <a href="#drivers">Drive with us</a>
              </li>
              <li>
                <a href="#partners">For the LGU</a>
              </li>
            </ul>
          </div>

          <div>
            <p className="eyebrow text-foreground">Contact</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>{footer.org}</li>
              {footer.contactLabel && (
                <li>
                  <a href={links.email}>{footer.contactLabel}</a>
                </li>
              )}
              {footer.phoneLabel && (
                <li>
                  <a href={links.phone}>{footer.phoneLabel}</a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <p className="eyebrow text-foreground">Legal</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/terms">Terms of Service</a>
              </li>
              <li>
                <a href="/privacy">Privacy Notice</a>
              </li>
              {links.documentation && (
                <li>
                  <a href={links.documentation}>Documentation</a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{footer.province}</p>
          <p>
            © {new Date().getFullYear()} {footer.org}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
