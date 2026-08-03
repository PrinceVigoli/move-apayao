# MOVE Apayao — public landing site

Static marketing/info site. No auth, no API calls, no backend.

## Develop

```bash
pnpm --filter @workspace/landing run dev
```

## Build

```bash
pnpm --filter @workspace/landing run build
```

Output is plain static files in `artifacts/landing/dist/` — upload the *contents*
to any static host. No environment variables are required.

Deploying to a sub-path instead of a domain root:

```bash
BASE_PATH=/move/ pnpm --filter @workspace/landing run build
```

## Deploying to Hostinger

1. Run the build above.
2. In hPanel → File Manager, open `public_html` (or the subdomain's folder).
3. Upload everything **inside** `dist/` — not the `dist` folder itself.
4. Confirm `index.html`, `favicon.svg`, `og-image.png`, `robots.txt` and
   `sitemap.xml` are all at the web root.

## Editing content

All copy, links, figures and route data live in one file:

    src/content/site.ts

No component edits needed for wording changes.

## Before going public — checklist

- [ ] **Replace the placeholder route.** `routeStrip.stops` and `loopGeometry.stops`
      in `site.ts` are invented stand-ins. Use the real loop from the `loops` /
      `loop_stops` tables. Keep both lists in the same order.
- [ ] **Fill the `TODO`s in `site.ts`** — app store links, dashboard URL, fleet
      figures, LGU contact email and phone.
- [ ] **Set the real domain** in three places: `<link rel="canonical">` and the
      `og:`/`twitter:` URLs in `index.html`, the `Sitemap:` line in
      `public/robots.txt`, and `<loc>` in `public/sitemap.xml`.
- [ ] **Check the honesty rule.** The page must not claim QR/NFC tap-to-pay or
      wallet top-up are available — those are switched off pending hardware
      procurement. Fares are cash.
- [ ] Verify the link preview with the Facebook Sharing Debugger — Messenger and
      Facebook are how this link will actually spread locally.

## Optional: analytics

Disabled unless both are set in `artifacts/landing/.env`:

```
VITE_ANALYTICS_DOMAIN=your-domain
VITE_ANALYTICS_SRC=https://plausible.io/js/script.js
```

Plausible is cookieless and collects no personal data, so it needs no consent
banner — relevant for a government site under the Data Privacy Act. With either
variable unset, no script loads and no requests are made.

## Optional: Ilokano

The language toggle is built but **hidden**, because the Ilokano strings in
`src/content/i18n.ts` were drafted without native-speaker review. On a public
LGU site, awkward translation is worse than showing English.

To enable: have a native speaker correct every string in `ilocanoDraft`, then set
`ILOCANO_READY = true`. Missing strings fall back to English automatically, so a
partial translation degrades cleanly.
