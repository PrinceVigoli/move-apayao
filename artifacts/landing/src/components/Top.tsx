import { ArrowRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { hero, links, steps, storesAreLive } from '@/content/site';
import { RouteStrip } from '@/components/RouteStrip';

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#coverage', label: 'Coverage' },
  { href: '#drivers', label: 'For drivers' },
  { href: '#partners', label: 'For the LGU' },
  { href: '#faq', label: 'FAQ' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a href="#top" className="flex items-baseline gap-2 text-white">
          <span className="display text-xl">MOVE</span>
          <span className="eyebrow text-accent">Apayao</span>
        </a>

        <ul className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-sm text-ink-soft transition-colors hover:text-white"
              >
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href={links.passengerAndroid}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Get the app
            </a>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-white md:hidden"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="mx-6 rounded-xl border border-white/10 bg-[hsl(var(--ink))] p-4 md:hidden">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-ink-soft hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="pt-2">
              <a
                href={links.passengerAndroid}
                className="block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground"
              >
                Get the app
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-[hsl(var(--ink))] pb-20 pt-32 md:pb-28 md:pt-40"
    >
      {/* Ambient: a faint contour wash, like the highland terrain the loop runs through */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full opacity-[0.16]"
        style={{
          background:
            'radial-gradient(circle, hsl(var(--accent)) 0%, transparent 62%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <p className="eyebrow rise text-accent">{hero.eyebrow}</p>

        <h1
          className="display rise mt-5 max-w-3xl text-[2.6rem] text-white sm:text-6xl lg:text-7xl"
          style={{ animationDelay: '60ms' }}
        >
          {hero.title}
        </h1>

        <p
          className="rise mt-6 max-w-xl text-lg leading-relaxed text-ink-soft"
          style={{ animationDelay: '120ms' }}
        >
          {hero.body}
        </p>

        <div
          className="rise mt-9 flex flex-wrap items-center gap-3"
          style={{ animationDelay: '180ms' }}
        >
          <a
            href={links.passengerAndroid}
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            {hero.primaryCta}
            <ArrowRight
              size={18}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </a>
          <a
            href="#drivers"
            className="rounded-lg border border-white/20 px-6 py-3.5 font-semibold text-white transition-colors hover:bg-white/5"
          >
            {hero.secondaryCta}
          </a>
        </div>

        <p className="rise mt-4 text-xs text-ink-soft" style={{ animationDelay: '220ms' }}>
          {hero.note}
          {!storesAreLive && ' Currently in pilot testing.'}
        </p>

        {/* Signature */}
        <div
          className="rise mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:mt-20 md:p-8"
          style={{ animationDelay: '280ms' }}
        >
          <RouteStrip tone="dark" />
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <p className="eyebrow text-primary">How it works</p>
      <h2 className="display mt-4 max-w-2xl text-3xl sm:text-4xl">
        Four steps, start to finish.
      </h2>

      {/* Numbered because this genuinely is a sequence — the order is the
          information. */}
      <ol className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.n} className="border-t border-border pt-5">
            <span className="font-mono text-sm font-semibold text-primary">{step.n}</span>
            <h3 className="mt-2 text-lg font-bold">{step.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
