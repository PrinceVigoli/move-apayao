import {
  ArrowRight,
  Check,
  CloudRain,
  History,
  MapPin,
  Star,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  coverage,
  drivers,
  faqs,
  features,
  footer,
  links,
  stakeholders,
} from '@/content/site';
import { RouteStrip } from '@/components/RouteStrip';

const ICONS: Record<string, LucideIcon> = {
  MapPin,
  Users,
  History,
  CloudRain,
  TriangleAlert,
  Star,
};

export function Coverage() {
  return (
    <section id="coverage" className="border-y border-border bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
        <div>
          <p className="eyebrow text-primary">{coverage.eyebrow}</p>
          <h2 className="display mt-4 text-3xl sm:text-4xl">{coverage.title}</h2>
          <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
            {coverage.body}
          </p>

          <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-5">
            {coverage.stats.map((s) => (
              <div key={s.label}>
                <dt className="eyebrow text-muted-foreground">{s.label}</dt>
                <dd className="display mt-1 text-2xl">{s.value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 border-l-2 border-accent pl-4 text-sm leading-relaxed text-muted-foreground">
            {coverage.caveat}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-background p-6 md:p-8">
          <RouteStrip tone="light" />
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <p className="eyebrow text-primary">What the app does</p>
      <h2 className="display mt-4 max-w-2xl text-3xl sm:text-4xl">
        Built for the way people actually travel here.
      </h2>

      <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const Icon = ICONS[f.icon] ?? MapPin;
          return (
            <div key={f.title}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon size={19} />
              </span>
              <h3 className="mt-4 font-bold">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Drivers() {
  return (
    <section id="drivers" className="bg-[hsl(var(--ink))]">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:py-28">
        <div>
          <p className="eyebrow text-accent">{drivers.eyebrow}</p>
          <h2 className="display mt-4 text-3xl text-white sm:text-4xl">{drivers.title}</h2>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">{drivers.body}</p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href={links.driverAndroid}
              className="group inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3.5 font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              {drivers.cta}
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>
          </div>
          <p className="mt-4 text-xs text-ink-soft">{drivers.note}</p>
        </div>

        <ul className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-7">
          {drivers.points.map((point) => (
            <li key={point} className="flex gap-3">
              <Check size={18} className="mt-0.5 shrink-0 text-accent" />
              <span className="text-[15px] leading-relaxed text-ink-soft">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Stakeholders() {
  return (
    <section id="partners" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <div className="max-w-2xl">
        <p className="eyebrow text-primary">{stakeholders.eyebrow}</p>
        <h2 className="display mt-4 text-3xl sm:text-4xl">{stakeholders.title}</h2>
        <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
          {stakeholders.body}
        </p>
      </div>

      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
        {stakeholders.items.map((item) => (
          <div key={item.title} className="bg-background p-7">
            <h3 className="font-bold">{item.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </div>

      <a
        href={links.dashboard}
        className="group mt-9 inline-flex items-center gap-2 font-semibold text-primary"
      >
        {stakeholders.cta}
        <ArrowRight
          size={17}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </a>
    </section>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="border-t border-border bg-muted/40">
      <div className="mx-auto max-w-3xl px-6 py-20 md:py-28">
        <p className="eyebrow text-primary">Questions</p>
        <h2 className="display mt-4 text-3xl sm:text-4xl">Before you ride.</h2>

        <div className="mt-10 divide-y divide-border border-y border-border">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={faq.q}>
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left"
                  >
                    <span className="font-semibold">{faq.q}</span>
                    <span
                      aria-hidden="true"
                      className={`shrink-0 font-mono text-lg text-primary transition-transform ${
                        isOpen ? 'rotate-45' : ''
                      }`}
                    >
                      +
                    </span>
                  </button>
                </h3>
                {isOpen && (
                  <p className="-mt-1 pb-6 pr-10 text-[15px] leading-relaxed text-muted-foreground">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-[hsl(var(--ink))] text-ink-soft">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-baseline gap-2 text-white">
              <span className="display text-xl">MOVE</span>
              <span className="eyebrow text-accent">Apayao</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed">{footer.support}</p>
          </div>

          <div>
            <p className="eyebrow text-white">Get the apps</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <a href={links.passengerAndroid} className="hover:text-white">
                  Passenger app
                </a>
              </li>
              <li>
                <a href={links.driverAndroid} className="hover:text-white">
                  Driver app
                </a>
              </li>
              <li>
                <a href={links.dashboard} className="hover:text-white">
                  Admin dashboard
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="eyebrow text-white">Contact</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>{footer.org}</li>
              <li>
                <a href={links.email} className="hover:text-white">
                  {footer.contactLabel}
                </a>
              </li>
              <li>
                <a href={links.phone} className="hover:text-white">
                  {footer.phoneLabel}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-white/10 pt-7 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>{footer.province}</p>
          <p>© {new Date().getFullYear()} {footer.org}</p>
        </div>
      </div>
    </footer>
  );
}
