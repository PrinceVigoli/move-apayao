# MOVE Apayao Documentation Portal

Versioned documentation platform intended for a dedicated host such as
`documentation.moveapayao.gov.ph`. Public content is compiled as a static site;
restricted runbooks are fetched from the API only after developer/superadmin
authorization.

```powershell
pnpm.cmd --filter @workspace/documentation run dev
pnpm.cmd --filter @workspace/documentation run build
```

The development server uses port `5176`; the production output is `dist/`.
Copy `.env.example` to `.env.local`, then set `VITE_PRODUCT_URL` to the public
MOVE landing URL and `VITE_API_URL` to the API origin. When a
development tunnel needs to access this Vite server, add its exact hostname to
the comma-separated `DOCS_ALLOWED_HOSTS` environment variable.

The build generates the API reference from `lib/api-spec/openapi.yaml`, emits
clean static routes and a 404 fallback, and creates `sitemap.xml` when
`DOCS_PUBLIC_URL` is configured. GitHub Actions publishes approved changes from
`main`; enable **Settings > Pages > GitHub Actions** and add the three repository
variables used by `.github/workflows/documentation.yml`.

The documentation origin must also be included in the API server's
`CORS_ALLOWED_ORIGINS` so the live status and protected runbook screens work.

Do not publish secrets, signing credentials, test-user passwords, private
tokens, or personal operational data in this portal.
