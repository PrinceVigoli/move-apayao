# Account deletion operations

The public page is `/delete-account`. Both apps link to it from Account & security. This is a verified request and administrator-processing workflow; it does not claim automatic deletion after 90 days.

The requester supplies the account email and current password. Deactivated accounts can request deletion with their existing password. The page also offers password-reset requests for active accounts and explains how to contact project support if recovery is unavailable. Never request passwords by email. Support must verify ownership before acting on an email-based request.

A private random reference shows the request status and any recorded retention explanation/end date, without exposing the account's name, email, ID or credentials. Keep the reference private. Submitted requests do not immediately deactivate an account. Duplicate submissions return the existing request.

## Administrator processing

Review the dashboard's **Account deletion** queue regularly. The published processing target is 30 days; contact the requester about unresolved holds or delays.

1. Review the verified request and resolve active trips/reservations, pending top-ups and wallet balances. Reassign or disable an enabled fixed-loop service before deleting its driver account. The server blocks completion until these holds are resolved.
2. Inspect applicable operational history and backup/service-provider obligations. If records must be retained, document the specific record categories, verified lawful basis and retention end date. These details are shown on the private receipt. Do not invent a statutory retention period or include names, passwords or email addresses in this explanation.
3. Confirm permanent deletion. The server transaction clears login/profile/contact information and driver identity/current location; removes sessions, reset tokens, device push tokens, app feedback, subscriptions and driver-phone GPS; removes rating comments and private audit metadata; and unlinks the driver from fleet GPS observations. A permanently disabled, non-identifying account placeholder preserves record references.
4. Trip/reservation, fare, incident and vehicle-assignment history is retained only with the required recorded explanation/end date. The dashboard flags expired retention. The responsible administrator must purge or redact the necessary records when that period ends, or document a valid continuing hold. Completion does not automatically destroy shared financial/trip/incident records belonging to other participants.
5. Handle any associated external file/provider records under their deletion procedures. Incident evidence under an approved hold is part of the retained incident record; profile links are cleared, but removing a database URL does not erase a separately hosted object.

Deleted accounts cannot sign in or be restored through ordinary account reactivation. Database guards also prevent new personal records being attached to a deleted account by stale requests.

## Backups and restores

Restrict backup access and apply the project's approved backup-retention schedule. Record any applicable backup retention in the deletion request. Before restoring an older database, preserve the current deletion-request/tombstone records separately in protected server storage and replay completed deletions against the restored database before reopening public access. Never treat a restored pre-deletion account as permission to reactivate it. A backup containing older personal data is not an active account database and must not be used for unrelated purposes.

## Verification

`scripts/account-deletion-integration.mjs` runs only against explicitly opted-in loopback suite databases. It checks requester verification, idempotency, receipt privacy, admin authorization, permanent account-data cleanup, session invalidation, anti-reactivation guards, financial/service holds and dated retention explanations. CI runs it after fixed-loop integration. Live verification must use a clearly labelled disposable account; do not test deletion on a real customer, operator or reviewer account.
