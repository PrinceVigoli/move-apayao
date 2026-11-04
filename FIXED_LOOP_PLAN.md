# Pudtol–Luna fixed-loop revision

Status (2026-10-30): passenger reservations and driver operations are implemented on the review branch and validated against isolated local databases. Live provisioning and deployment remain pending.

## Confirmed directional stops and operating rules

- Pudtol → ASC via Payanan Road: Pudtol Public Market → Dagupan Gym → Luna National High School → Apayao Provincial Capitol, San Isidro Sur → Apayao State College.
- ASC → Pudtol via the national highway: Apayao State College → Tumog National High School → Dagupan Gym → Pudtol Public Market.
- ASC remains the terminal. Tumog is on the return leg only. Stop coordinates and physical seat labels still need field verification.
- The user approved the proposed daily timetable as sequential 30-minute legs. ASC departures: 6:00, 7:00, 8:00, 11:00 AM; 12:00, 4:00, 5:00, 6:00 PM. Pudtol departures: 6:30, 7:30, 8:30, 11:30 AM; 12:30, 4:30, 5:30, 6:30 PM. Each leg arrives 30 minutes later; dates/times use Asia/Manila.
- Reservations cover today and the following six days and close at the terminal departure time. Intermediate pickup times are not invented; passengers follow the live vehicle location.
- Capacity is 19 numbered seats and 10 standing places for overlapping stop segments. A seat can be reserved again for a later nonoverlapping journey.
- The driver confirms boarding, no-shows, walk-ins, arrival and alighting. Neither the clock nor GPS automatically releases occupied places. Boarding retains the allocation; explicit alighting releases only that reservation's allocation.
- Driver cancellation with onboard passengers requires confirmation that everyone has alighted. Retried stop advancement cannot skip stops.
- Local fixtures are created only by `scripts/src/seed-local-fixed-loop.ts`, with a loopback validation-database guard and ignored credentials.

## Release follow-up

Provision the dedicated account using `scripts/src/seed-fixed-loop.ts` with `FIXED_LOOP_PROVISION=1`, preserving credentials in ignored private storage. Then use `scripts/src/configure-fixed-loop.ts` with `FIXED_LOOP_CONFIGURE=1` to configure the confirmed service. This operation is repeat-safe, refuses mismatching existing assignments/stops, and never fabricates GPS or changes a moving vehicle. Do not use local fixtures against a live database.

The `pilot` EAS profile in each app produces a signed standalone APK connected to the permanent live API, with remote version increments. This direct-download pilot is separate from later Play Store publication.

Fares and collection remain for operator confirmation; this implementation collects no online payment. Verify stop pins, physical seat labels, timetable feasibility, actual GPS, cancellation notifications and a full pilot journey before deployment. The admin feedback inbox is implemented; general service/timetable management is not yet an admin UI.

The existing on-demand screens are retained as components for later development, and the dedicated fixed-loop vehicle is excluded from on-demand matching. Passenger annual plans are removed from the app and no longer created during registration. Driver subscription eligibility remains unchanged.

Validation commands and publication blockers are recorded in LOCAL_VALIDATION.md.
