/**
 * Language support.
 *
 * English is the complete source of truth. Ilocano is provided as a DRAFT and
 * is deliberately gated behind ILOCANO_READY below.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BEFORE ENABLING ILOCANO — read this
 * ─────────────────────────────────────────────────────────────────────────
 * The Ilocano strings below were drafted without native-speaker review. On a
 * public LGU/DOST site, awkward or wrong translation is worse than showing
 * English, so the toggle stays hidden until someone who actually speaks
 * Ilocano has gone through every string and corrected it.
 *
 * To enable:
 *   1. Have a native speaker review and correct every entry in `ilo` below.
 *   2. Set ILOCANO_READY = true.
 *
 * Anything missing from `ilo` automatically falls back to English, so a
 * partial translation degrades cleanly rather than showing blank text.
 */

export const ILOCANO_READY = false;

export type Lang = "en" | "ilo";

export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "ilo", label: "Ilokano", short: "ILO" },
];

/* ------------------------------------------------------------------ */
/* Ilocano draft — NEEDS NATIVE REVIEW (see note above)                */
/* ------------------------------------------------------------------ */

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const ilocanoDraft = {
  nav: {
    how: "Kasano ti panagusar",
    coverage: "Sakup a lugar",
    drivers: "Para kadagiti drayber",
    partners: "Para iti LGU",
    faq: "Saludsod",
    getApp: "Alaen ti app",
  },
  hero: {
    eyebrow: "Pudtol · Apayao",
    title: "E-trike a mabalinmo a masubaybayan.",
    body: "Mag-book manipud iti barangay yo, buyaen ti drayber nga umas-asideg iti mapa, ket bayadan ti plete iti cash inton makadanon kayo.",
    primaryCta: "Alaen ti app",
    secondaryCta: "Agdrayber kadakami",
    note: "Libre nga i-download. Awan ti bayad iti account.",
  },
  common: {
    language: "Pagsasao",
  },
} satisfies DeepPartial<Record<string, Record<string, unknown>>>;
