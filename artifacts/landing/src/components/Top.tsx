import { ArrowRight, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { hero, links, steps, storesAreLive } from '@/content/site';
import { ILOCANO_READY, LANGUAGES } from '@/content/i18n';
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
  const [scrolled, setScrolled] = useState(false);

  // The nav used to be `absolute`, which meant it only ever existed over the
  // hero and scrolled away with everything else — there was no way to get
  // back to nav links or the primary CTA without scrolling to the very top.
  // It's `fixed` now, transparent over the dark hero and picking up a solid
  // ink background once you've scrolled past it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${
        scrolled
          ? 'border-b border-white/10 bg-[hsl(var(--ink)/0.92)] backdrop-blur-sm'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a href="#top" className="flex items-baseline gap-2 py-2 text-white">
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
          {ILOCANO_READY && (
            <li>
              <LangToggle />
            </li>
          )}
          <li>
            <a
              href={links.passengerAndroid}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]"
            >
              Get the app
            </a>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 flex h-11 w-11 items-center justify-center text-white md:hidden"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="rise mx-6 rounded-xl border border-white/10 bg-[hsl(var(--ink))] p-4 md:hidden">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="pt-2">
              <a
                href={links.passengerAndroid}
                className="block rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-transform duration-150 active:scale-[0.97]"
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
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
          >
            {hero.primaryCta}
            <ArrowRight
              size={18}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </a>
          <a
            href="#drivers"
            className="rounded-lg border border-white/20 px-6 py-3.5 font-semibold text-white transition-colors duration-150 hover:bg-white/5 active:bg-white/10"
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
      <p className="eyebrow text-primary-strong">How it works</p>
      <h2 className="display mt-4 max-w-2xl text-3xl sm:text-4xl">
        Four steps, start to finish.
      </h2>

      {/* Numbered because this genuinely is a sequence — the order is the
          information. */}
      <ol className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
        {steps.map((step) => (
          <li key={step.n} className="border-t border-border pt-5">
            <span className="font-mono text-sm font-semibold text-primary-strong">{step.n}</span>
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


/**
 * Language switcher. Hidden until ILOCANO_READY is set — see content/i18n.ts
 * for why (unreviewed translation on a government site is worse than English).
 */
function LangToggle() {
  const [lang, setLang] = useState<string>(
    () => localStorage.getItem('moveapayao.lang') ?? 'en',
  );

  const choose = (code: string) => {
    setLang(code);
    localStorage.setItem('moveapayao.lang', code);
    document.documentElement.lang = code;
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/20 p-0.5">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => choose(l.code)}
          aria-pressed={lang === l.code}
          className={`rounded px-2 py-1 font-mono text-[11px] tracking-wide transition-colors ${
            lang === l.code ? 'bg-white/15 text-white' : 'text-ink-soft hover:text-white'
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
