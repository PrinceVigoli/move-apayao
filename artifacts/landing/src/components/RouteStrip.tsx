import type { FeaturedLoop } from '@/lib/loops';

/**
 * The page's signature element.
 *
 * A transit-map leg: the stops of the loop laid on a line, with a bead that
 * travels it the way a vehicle travels the circuit. Public transport has its
 * own visual language — route diagrams, stop dots, monospaced route codes —
 * and this borrows it rather than inventing decoration. It also happens to be
 * the literal product: a fixed loop through named barangays.
 *
 * Horizontal on desktop, vertical on mobile, because a column of stops is how
 * a route reads on a phone-sized screen.
 */
export function RouteStrip({
  tone = 'dark',
  loop,
}: {
  tone?: 'dark' | 'light';
  loop: FeaturedLoop | null;
}) {
  const lineColor = tone === 'dark' ? 'bg-white/15' : 'bg-foreground/12';
  const stopColor = tone === 'dark' ? 'bg-white/35' : 'bg-foreground/30';
  const labelColor = tone === 'dark' ? 'text-ink-soft' : 'text-muted-foreground';
  const endLabel = tone === 'dark' ? 'text-white' : 'text-foreground';
  const stops = [...(loop?.stops ?? [])]
    .sort((a, b) => a.sequence - b.sequence)
    .map((stop) => stop.name);
  const code = loop ? `LOOP ${String(loop.route.id).padStart(2, '0')}` : 'LOOP';
  const name = loop?.route.name ?? 'Route not configured';

  return (
    <div className="w-full">
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="eyebrow rounded bg-primary px-2 py-1 text-primary-foreground">
          {code}
        </span>
        <span className={`text-sm font-semibold ${endLabel}`}>{name}</span>
        <span
          className={`eyebrow rounded-full border px-2 py-0.5 ${
            tone === 'dark'
              ? 'border-accent/40 text-accent'
              : 'border-accent/60 text-accent-foreground'
          }`}
        >
          {loop ? 'Active' : 'Unavailable'}
        </span>
      </div>

      {/* Desktop: horizontal leg */}
      <div className="relative hidden md:block" aria-hidden="true">
        <div className={`absolute left-0 right-0 top-[7px] h-[2px] ${lineColor}`} />
        <div
          className="absolute top-[1px] h-[14px] w-[14px] rounded-full bg-accent shadow-[0_0_16px_4px_hsl(var(--accent)/0.5)]"
          style={{ animation: 'bead-travel 9s cubic-bezier(0.6,0,0.4,1) infinite alternate' }}
        />
        <div className="relative flex justify-between">
          {stops.map((stop, i) => {
            const terminus = i === 0 || i === stops.length - 1;
            return (
              <div key={stop} className="flex flex-col items-center gap-3">
                <span
                  className={`h-4 w-4 rounded-full border-2 ${
                    tone === 'dark' ? 'border-[hsl(var(--ink))]' : 'border-background'
                  } ${terminus ? 'bg-primary' : stopColor}`}
                  style={
                    terminus
                      ? { animation: 'pulse-stop 2.6s ease-in-out infinite' }
                      : undefined
                  }
                />
                <span
                  className={`font-mono text-[11px] tracking-wide ${
                    terminus ? endLabel : labelColor
                  }`}
                >
                  {stop}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: vertical leg */}
      <div className="relative md:hidden" aria-hidden="true">
        <div className={`absolute bottom-2 left-[7px] top-2 w-[2px] ${lineColor}`} />
        <ul className="space-y-4">
          {stops.map((stop, i) => {
            const terminus = i === 0 || i === stops.length - 1;
            return (
              <li key={stop} className="relative flex items-center gap-4">
                <span
                  className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                    tone === 'dark' ? 'border-[hsl(var(--ink))]' : 'border-background'
                  } ${terminus ? 'bg-primary' : stopColor}`}
                />
                <span
                  className={`font-mono text-xs tracking-wide ${
                    terminus ? endLabel : labelColor
                  }`}
                >
                  {stop}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Screen-reader equivalent of the diagram above */}
      <p className="sr-only">
        {code}, {name}: stops at {stops.join(', ')}.
      </p>
    </div>
  );
}

/** A hairline divider carrying the same stop-dot motif. */
export function RouteRule() {
  return (
    <div className="mx-auto flex max-w-6xl items-center gap-3 px-6" aria-hidden="true">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      <span className="h-px flex-1 bg-border" />
      <span className="h-1.5 w-1.5 rounded-full bg-border" />
    </div>
  );
}
