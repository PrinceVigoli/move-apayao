# MOVE Apayao public site

Public marketing, route-coverage, contact, password-reset, Terms of Service, and
Privacy Notice site. The active route map reads the public API; legal and contact
pages remain available if the API is temporarily offline.

## Develop

```bash
pnpm --filter @workspace/landing run dev
```

## Build and deploy

For local testing:

```bash
pnpm --filter @workspace/landing run build
```

For a real deployment, copy `.env.example` to `.env.production`, complete every
required value, and run:

```bash
pnpm --filter @workspace/landing run build:production
```

The production command validates the permanent domain, public dashboard,
support/privacy contacts, and Maps key before creating `dist/`. Both commands
produce a plain static site in `artifacts/landing/dist/`.

When deploying to a sub-path instead of a domain root, set `BASE_PATH=/move/`.
Upload everything inside `dist/`, not the directory itself. The included
`.htaccess` sends `/terms`, `/privacy`, and `/reset-password` to the single-page
entry point on Apache/Hostinger. On another host, configure the same fallback to
`/index.html`.

Canonical, Open Graph, robots, and sitemap origins are generated from
`VITE_SITE_URL` during the build.

## Public-launch checklist

- [ ] Publish the real loop and its ordered stops in the dashboard. The public
      map never invents fallback geometry.
- [ ] Complete `.env.production`, including the permanent site/dashboard URLs,
      restricted Maps browser key, service support email, and approved DPO or
      privacy-contact email. `build:production` rejects missing values.
- [ ] Have the operator's DPO or legal adviser approve the Terms and Privacy
      Notice. Confirm the named personal information controller, retention
      schedule, processors/data-sharing agreements, and privacy request process.
- [ ] Add preview-build or store URLs. Keep `VITE_STORES_LIVE=false` during the
      pilot; switch it only when both Android listings are public.
- [ ] Keep public wording aligned with actual behavior. The current pilot uses
      cash; it does not claim QR/NFC payment or wallet top-up.
- [ ] Test `/`, `/terms`, `/privacy`, and `/reset-password` by opening each URL
      directly after deployment, then verify the Facebook/Messenger link preview.

## Content and optional features

Public copy and configuration defaults live in `src/content/site.ts`. Analytics
remains disabled unless both `VITE_ANALYTICS_DOMAIN` and `VITE_ANALYTICS_SRC` are
set. The Ilokano toggle remains hidden until every public string has been reviewed
by a native speaker.
