# Local Android validation and Google Play assessment

Date: 2026-10-30 (Asia/Manila).

The passenger app now opens the Pudtol?Luna fixed loop and supports dated directional departures, selected stops, numbered seats/standing places, tickets and cancellation. The assigned driver sees daily runs, manifests, boarding/no-shows, walk-ins and explicit arrival/alighting controls. This is local validation for a review branch, not production release approval.

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
- Resolve the image-parser security probe through the actual Expo CLI
  dependency chains. A clean pnpm install can shorten package-store names,
  so a folder-name check incorrectly rejected the patched parser in CI.
  The malformed-input and timeout checks remain enforced.

## Automated and API results

| Check | Result |
| --- | --- |
| Pinned Node.js 22.23.1, pnpm 11.17.0 | Used for final workspace validation |
| `pnpm run release:check` | Passed: security regression, 22 tests, all workspace type checks and builds |
| Passenger and driver Expo SDK compatibility | Passed against online compatibility data |
| Passenger and driver Android Hermes exports | Passed on final source with clean Metro caches and Node.js 22 |
| Committed database migrations | Passed on isolated local PostgreSQL/PostGIS database |
| Local API runtime smoke test | 15 checks passed, including verification that new passengers receive no annual plan |
| `pnpm audit --prod --audit-level critical` | Passed after fixes: 0 critical; 42 high, 27 moderate and 2 low findings remain |
| Public API `/api/livez` and `/api/healthz` | HTTP 200 in read-only checks |
| Public website `/privacy` and `/terms` | HTTP 200 in read-only checks |
| GitHub CI on implementation commit `0d1f136` | All System checks passed, including fresh-database integration and both Android exports, in [run 40968019704](https://github.com/PrinceVigoli/move-apayao/actions/runs/40968019704) |

The isolated API runs on port 5500, uses database
`move_apayao_validation_20261029` and local Redis database 15. Disposable smoke-test accounts
remain deactivated there; the isolated phone fixtures remain active for review. No live accounts, bookings or database records were
changed. Local health reports degraded because Google Routes credentials are
intentionally absent; paid routing, matching a real driver, push delivery and
physical journeys have not been validated.

The dashboard build emits an existing tooltip source-map warning but succeeds.
The remaining high-severity audit findings need dependency-path and runtime
exposure review before publication; passing the critical-only gate does not
establish that the dependency tree is free of vulnerabilities.

## Android device results

A Samsung Galaxy A54 (SM-A546E, Android 16/API 36) ran a separate source-built development APK, package com.moveapayao.mobile.localtest. USB reverse connects it to the isolated API. Physical checks passed for sign-in/session restore, the fixed-loop service and directional departure picker, numbered seat selection, reservation ticket, cancellation, Profile without an annual plan, and feedback submission with a server-issued reference. The greeting now uses Asia/Manila and refreshes on foreground/minute boundaries; the observed morning greeting matched the phone's 6 AM clock.

The local e-jeep is deliberately off duty with no fabricated GPS. A live map and actual pickup/alighting journey remain unverified. The separate local-test package previously showed blank Google map tiles; native Maps package/signing restrictions must be verified for final release packages. No map is rendered when vehicle GPS is unavailable.

A separate source-built driver APK, com.moveapayao.driver.localtest, also installed and ran on the same device. Local operator sign-in, automatic fixed-loop mode, the Runs/Profile navigation, dated run selection and the shared manifest passed. The manifest showed the cancelled passenger booking and a second confirmed reservation with seat 4, while actual onboard counts correctly remained zero. Driver boarding/alighting and walk-in lifecycle were exercised in the runtime integration suite; physical route travel and live GPS remain pending. Final native artifacts are local development builds, not signed store binaries. The phone has 4 KB memory pages, so these checks do not establish 16 KB compatibility.

## Fixed-loop runtime integration

All four migrations apply from an empty isolated PostgreSQL/PostGIS database. scripts/fixed-loop-integration.mjs passed eight groups against a second database (move_apayao_validation_suite_final_20261030), API 5501 and Redis 14:

- Correct directional stops, 19 seated/10 standing, 16 daily half-hour legs and seven-day booking horizon.
- Concurrent final-seat attempts yield exactly one success; database uniqueness also rejects occupied duplicate segments.
- Separate seat/standing capacity, full inventory, invalid selections and stop order.
- Idempotent booking retries, one active passenger booking per run, segment reuse, cancellation and privacy.
- Driver boarding without double deduction, departure cutoff, no-shows, walk-ins using shared inventory, explicit alighting protecting downstream reservations and retry-safe stop advancement.
- Completed departures reject new reservations; cancellation with onboard passengers requires alighting confirmation.
- Feedback input validation, privileged inbox/status updates and passenger access restrictions.
- Fresh GPS visibility requires an active shift; stale GPS is withheld and fixed-loop drivers remain excluded from on-demand dispatch.

CI now runs the same integration suite with disposable PostGIS/Redis services. It requires a freshly seeded database whose name starts with move_apayao_validation_suite_ or move_apayao_validation_ci, a loopback API URL and LOCAL_FIXED_LOOP_TEST=1. The suite adjusts only its disposable run timestamps to test departure rules at any hour. Local fixture credentials remain in ignored local-secrets and are never committed.

## Google Play decision

Status: not ready for production publication. The screenshot establishes a
personal Play Console account, but not when that account was created or whether
its verification and production-access requirements are complete.

Before publication:

1. Verify exact stop pins, physical seat labels, fares and daily timetable
   feasibility with the configured live pilot operator. Complete an actual pilot journey.
2. Complete physical Android tests: onboarding, permissions, map display,
   registration/login, offline/reconnect behavior, notifications and actual trip
   flows for both passenger and driver. Device launch alone is insufficient.
3. Operate the account-deletion queue and confirm the lawful retention rules
   with the project operator. The verified web request, in-app links, admin
   completion and personal-data cleanup are now implemented; see ACCOUNT_DELETION.md.
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

## Standalone pilot update

The pilot APK profiles target the live API and are separate from Play Store submission. Live service provisioning uses the guarded seed/configuration scripts in FIXED_LOOP_PLAN.md. The website describes scheduled e-jeep reservations, numbered seats/standing places and driver manifests rather than the later on-demand enhancement. Shared VPS download storage is configurable with RELEASE_DOWNLOADS_DIR so versioned releases preserve the published APKs.

Account-deletion verification passed six runtime test groups after the eight fixed-loop groups on an isolated local database. A fresh browser submitted and refreshed a private request receipt. No live user account was erased. Schema and server guards prevent ordinary reactivation and new personal records after permanent deletion; financial/service holds and recorded retention remain administrator responsibilities.

### VPS and standalone APK verification — October 30, 2026

Release source `1aa23ca` passed GitHub System checks (run `40989949858`) and
was deployed with protected source/database backups, verified dump manifest,
rollback images and the previous APKs retained on the VPS. All five migrations
are applied. Public website, admin, documentation, API health, deletion page
and both APK downloads returned HTTP 200.

The guarded provisioning scripts configured the dedicated approved pilot
driver, confirmed directional stops, 19 numbered seats, 10 standing places and
16 daily half-hour legs. The vehicle remains off duty without fabricated GPS.
A dedicated live passenger test verified booking, shared driver manifest and
cancellation restoring availability. A disposable account verified the live
deletion page's password-authenticated submission, private receipt and refresh.

Signed standalone APKs were installed as updates on the Galaxy A54 (Android 16)
using the same certificates as the previously installed packages:

| App | Package | Version code | SHA-256 |
| --- | --- | --- | --- |
| Passenger | `com.moveapayao.mobile` | 4 | `1f0795dfaa3a7486db3d271c9f549e401851be4ada02ea9089c911833e21e87a` |
| Driver | `com.moveapayao.driver` | 2 | `8ac2eec8c3b91a6aa3d2e31ef468cc29766459dab9d261490d5f483709ef3eda` |

On the production passenger APK, live sign-in, fixed-loop home, tomorrow's
departure, numbered-seat availability and seat 4 booking succeeded. The driver
APK displayed the same reference and seat in its matching run manifest. The
passenger cancelled that reservation successfully. Both public download
responses matched the local APK hashes. Neither APK needs Metro or a USB
connection. This verifies pilot software flows, not an actual vehicle journey,
native GPS/background tracking, physical stops or fare operations.
