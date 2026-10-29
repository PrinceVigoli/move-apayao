# Local Android validation and Google Play assessment

Date: 2026-10-29 (Asia/Manila).

This validates the existing passenger/driver apps. The planned Pudtol-Luna
reservation inventory (19 seated + 10 standing), directional schedules and
driver manifest are not implemented by these changes. This is not a production
release approval.

## Changes made during validation

- Pin transitive `proxy-addr` to 2.0.8 and `shell-quote` to 1.11.0 to remove
  the two critical advisories reported by the repository's dependency gate.
- Make both apps open legal documents on `https://moveapayao.com` by default.
  The previous fallback used the API origin, whose `/privacy` returns 404.
  Explicit `EXPO_PUBLIC_LEGAL_BASE_URL` overrides remain supported; environment
  examples now use the working public website.
- Add `scripts/local-api-smoke.mjs` for reproducible runtime API checks against
  a loopback server with an explicit write opt-in and disposable account.
- Declare `babel-preset-expo` in both apps. A clean transform of the changed
  legal module exposed a missing direct dependency that prior Metro caches
  had masked.

## Automated and API results

| Check | Result |
| --- | --- |
| Pinned Node.js 22.23.1, pnpm 11.17.0 | Used for final workspace validation |
| `pnpm run release:check` | Passed: security regression, 22 tests, all workspace type checks and builds |
| Passenger and driver Expo SDK compatibility | Passed against online compatibility data |
| Passenger and driver Android Hermes exports | Passed on final source with clean Metro caches and Node.js 22 |
| Committed database migrations | Passed on isolated local PostgreSQL/PostGIS database |
| Local API runtime smoke test | 14 checks passed, including a rerun after dependency fixes under Node.js 22 |
| `pnpm audit --prod --audit-level critical` | Passed after fixes: 0 critical; 42 high, 27 moderate and 2 low findings remain |
| Public API `/api/livez` and `/api/healthz` | HTTP 200 in read-only checks |
| Public website `/privacy` and `/terms` | HTTP 200 in read-only checks |

The isolated API runs on port 5500, uses database
`move_apayao_validation_20261029` and local Redis database 15. Test accounts
remain deactivated there. No live accounts, bookings or database records were
changed. Local health reports degraded because Google Routes credentials are
intentionally absent; paid routing, matching a real driver, push delivery and
physical journeys have not been validated.

The dashboard build emits an existing tooltip source-map warning but succeeds.
The remaining high-severity audit findings need dependency-path and runtime
exposure review before publication; passing the critical-only gate does not
establish that the dependency tree is free of vulnerabilities.

## Android device results

A Samsung Galaxy A54 (SM-A546E) is connected through ADB. The installed apps
and stored pilot APKs are older builds, so their behavior cannot certify current
source. A separate `com.moveapayao.mobile.localtest` development APK is being
built from current passenger source, with local API traffic routed through USB.
Device validation is pending. Native build files and temporary exports are local
artifacts, not release binaries.

## Google Play decision

Status: not ready for production publication. The screenshot establishes a
personal Play Console account, but not when that account was created or whether
its verification and production-access requirements are complete.

Before publication:

1. Implement and validate the fixed-loop launch scope, including concurrency
   limits for seated/standing reservations, walk-ins, cancellations and boarding.
2. Complete physical Android tests: onboarding, permissions, map display,
   registration/login, offline/reconnect behavior, notifications and actual trip
   flows for both passenger and driver. Device launch alone is insufficient.
3. Provide an account/data deletion request path in the app and on the website.
   Current account deactivation is explicitly recoverable and retains account
   data; it is not a verified deletion workflow. Define retained records and
   retention periods with the service operator.
4. Review the remaining high-severity dependency findings and resolve applicable
   risks before producing the publication candidate.
5. Produce signed production AABs, verify target API and 16 KB page-size support
   on the final binaries, and validate permanent API, native Maps restrictions
   and Firebase configuration. The existing pilot APK and installed React
   Native Gradle defaults target API 36; that does not certify a future AAB.
6. Complete accurate store listing, screenshots, privacy policy, Data safety,
   content rating, app-access reviewer credentials and the driver's background
   location declaration where applicable. Use a controlled test track first.
7. If the personal developer account was created after November 13, 2023,
   complete the required closed test with at least 12 continuously opted-in
   testers for 14 days before applying for production access.

Official sources checked on the assessment date:

- [Personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Target API requirements: API 36 for new phone apps from August 31, 2026](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [16 KB page-size support](https://developer.android.com/guide/practices/page-sizes)
- [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)
- [shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)

## Repeat the local API checks

Use Node.js from `.nvmrc`, apply the committed migrations to an isolated test
database, then start the API with that database, local Redis, a development JWT
secret, and `PORT=5500`. Do not point this at live services.

```powershell
$env:LOCAL_SMOKE_API_URL='http://127.0.0.1:5500'
$env:LOCAL_SMOKE_ALLOW_WRITES='true'
node scripts/local-api-smoke.mjs
```

The script creates and deactivates one account per run and does not print
passwords or session tokens. It expects a fresh local rate-limit budget. Set
`EXPO_PUBLIC_API_URL=http://127.0.0.1:5500` when starting the test Metro server,
and use `adb reverse tcp:5500 tcp:5500` plus `adb reverse tcp:8081 tcp:8081` for
a phone connected over USB. Those settings belong only to local testing.
