import { Leaf } from "lucide-react";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M6 34 21 16l8 9L38 10l20 24H6Z"
        fill="currentColor"
        opacity=".96"
      />
      <path d="m18 31 4-5 7 8 9-12 11 12H18Z" fill="white" opacity=".9" />
      <path
        d="M8 38c10-5 18-4 25 1 7 5 14 5 23-1M8 47c10-5 18-4 25 1 7 5 14 5 23-1"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="51" cy="12" r="5" fill="#FFB020" />
    </svg>
  );
}

export function BrandLockup({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <BrandMark
        className={`h-11 w-11 ${inverse ? "text-white" : "text-primary"}`}
      />
      <span className="leading-none">
        <span
          className={`block text-lg font-extrabold tracking-[-0.035em] ${inverse ? "text-white" : "text-foreground"}`}
        >
          MOVE{" "}
          <span className={inverse ? "text-accent" : "text-primary"}>
            Apayao
          </span>
        </span>
        <span
          className={`mt-1 block text-[10px] font-semibold uppercase tracking-[0.2em] ${inverse ? "text-white/55" : "text-muted-foreground"}`}
        >
          by DOST Apayao
        </span>
      </span>
    </span>
  );
}

export function TrustMark() {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
        <Leaf size={15} />
      </span>
      Locally built for Apayao first and will expand to the rest of the Philippines in the future.
    </span>
  );
}
