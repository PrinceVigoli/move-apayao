import {
  ArrowRight,
  CarFront,
  CheckCircle2,
  MapPin,
  Menu,
  ShieldCheck,
  Smartphone,
  Star,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { hero, links, steps, storesAreLive } from "@/content/site";
import { ILOCANO_READY, LANGUAGES } from "@/content/i18n";
import { BrandLockup } from "@/components/Brand";
import { Reveal } from "@/components/Motion";
import { ProductPhone } from "@/components/ProductPhone";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#coverage", label: "Coverage" },
  { href: "#drivers", label: "For drivers" },
  { href: "#partners", label: "For the LGU" },
  { href: "#faq", label: "FAQ" },
];

const STEP_ICONS = [Smartphone, MapPin, CarFront, Star];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
        <a href="#top" aria-label="MOVE Apayao home" className="shrink-0">
          <BrandLockup />
        </a>

        <ul className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="nav-link">
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
              className="button button-primary button-sm"
            >
              Get the app
              <ArrowRight size={15} />
            </a>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="grid h-11 w-11 place-items-center rounded-full border border-border bg-white text-foreground lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </nav>

      <div
        id="mobile-navigation"
        className={`mobile-nav lg:hidden ${open ? "is-open" : ""}`}
      >
        <div className="mx-5 mb-4 rounded-3xl border border-border bg-background p-3 shadow-2xl shadow-foreground/10 sm:mx-8">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-muted"
            >
              {item.label}
              <ArrowRight size={15} className="text-primary" />
            </a>
          ))}
          <a
            href={links.passengerAndroid}
            className="button button-primary mt-2 w-full justify-center"
          >
            Get the app <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </header>
  );
}

export function Hero() {
  const sceneRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (
      !scene ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const shift = Math.min(window.scrollY * 0.08, 42);
      scene.style.setProperty("--hero-shift", `${shift}px`);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section id="top" className="hero-section">
      <div className="hero-stage">
        <img
          ref={sceneRef}
          src="/images/move-apayao-hero.webp"
          alt="A green electric tricycle overlooking the mountain landscape of Apayao"
          className="hero-scene"
          fetchPriority="high"
        />
        <div className="hero-wash" aria-hidden="true" />
        <div className="topo-pattern" aria-hidden="true" />

        <div className="hero-layout relative z-10 mx-auto grid min-h-[680px] max-w-7xl items-center gap-10 px-5 pb-16 pt-32 sm:px-8 lg:grid-cols-[1.12fr_0.88fr] lg:pb-20 lg:pt-36">
          <div className="hero-copy max-w-2xl">
            <div className="hero-eyebrow">
              <span className="status-dot" />
              {hero.eyebrow}
              <span>Now in pilot</span>
            </div>

            <h1 className="display mt-6 text-[clamp(3.2rem,5.7vw,5.25rem)] text-foreground">
              E-trike rides you can{" "}
              <span className="text-primary">actually track.</span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Book from your barangay, follow your driver live, and arrive with
              confidence.
            </p>

            <div className="hero-actions mt-9 flex flex-wrap gap-3">
              <a
                href={links.passengerAndroid}
                className="button button-primary"
              >
                {hero.primaryCta}
                <span className="button-orb">
                  <ArrowRight size={17} />
                </span>
              </a>
              <a href="#drivers" className="button button-secondary">
                {hero.secondaryCta}
                <CarFront size={17} />
              </a>
            </div>

            <p className="hero-note mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 size={15} className="text-primary" />
              {hero.note}
              {!storesAreLive && " Currently in pilot testing."}
            </p>

            <div className="hero-trust mt-10 grid max-w-xl grid-cols-3 gap-2 border-t border-foreground/10 pt-6 sm:gap-5">
              {[
                { Icon: ShieldCheck, label: "Local & trusted" },
                { Icon: MapPin, label: "Live driver tracking" },
                { Icon: Users, label: "Group booking" },
              ].map(({ Icon, label }) => (
                <div key={label} className="hero-trust-item">
                  <Icon size={20} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-product" aria-hidden="true">
            <div className="hero-halo" />
            <ProductPhone />
            <div className="arrival-pill">
              <span className="arrival-icon">
                <CarFront size={18} />
              </span>
              <span>
                <strong>Driver nearby</strong>Live location updated
              </span>
              <span className="arrival-live">LIVE</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-border bg-background">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.65fr_2.35fr] lg:items-center lg:py-16">
        <Reveal>
          <p className="eyebrow text-primary">Simple from the start</p>
          <h2 className="display mt-3 text-3xl sm:text-4xl">
            Your ride in four steps.
          </h2>
        </Reveal>

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? MapPin;
            return (
              <Reveal key={step.n} delay={index * 80}>
                <li className="step-card">
                  <div className="flex items-center justify-between">
                    <span className="step-icon">
                      <Icon size={21} />
                    </span>
                    <span className="step-number">{index + 1}</span>
                  </div>
                  <h3 className="mt-5 font-bold leading-snug">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function LangToggle() {
  const [lang, setLang] = useState<string>(
    () => localStorage.getItem("moveapayao.lang") ?? "en",
  );

  const choose = (code: string) => {
    setLang(code);
    localStorage.setItem("moveapayao.lang", code);
    document.documentElement.lang = code;
  };

  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-white p-1">
      {LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          onClick={() => choose(language.code)}
          aria-pressed={lang === language.code}
          className={`rounded-full px-2 py-1 font-mono text-[11px] ${
            lang === language.code
              ? "bg-primary text-white"
              : "text-muted-foreground"
          }`}
        >
          {language.short}
        </button>
      ))}
    </div>
  );
}
