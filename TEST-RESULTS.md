# v3.5 test results

Executed 11 November 2026 with Node.js 24.22.1. Tests use synthetic records only; no live client data or accounts were accessed.

## Completed checks

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Source structure | Pass | `npm run check:source` |
| Strict TypeScript | Pass | `npm run typecheck` |
| Logic, server handler and PostgreSQL tests | 40 passed | `npm test`; signed handler transport is mocked; database SQL runs in PGlite's PostgreSQL engine. |
| Mounted application interactions | 8 passed | `npm run test:app`; React application and components mounted in jsdom using Testing Library and user-event. |
| Production build | Pass | `npm run build`; Vite emits the production bundle. |
| Full check command | Pass | `npm run check` runs the above in sequence. See `verification.log`. |

## Application tests cover

- Navigation removal, active counts, archived-project Agreements access, Settings automations and task completion in the real App component.
- CSV upload/import with deduplication and preserved existing records; custom Other source editing.
- Lead → proposal → acceptance → one client/project/onboarding/renewal without fabricated revenue.
- Private agreement upload, signed view, authenticated download, confirmed deletion, metadata retention, failed deletion and rejected file types (mocked Storage transport).
- Actual sync hook: no successful status before server acknowledgement; edits arriving during a write are drained; interrupted writes and recovery drafts across remount; a successful write with lost acknowledgement; independent merges and explicit conflict resolution.

## PostgreSQL tests cover

- The additive migration runs twice.
- An owner cannot see another owner's workspace records.
- Stale patches fail without changing saved data.
- Amount/currency mismatch rolls back payment processing; repeated events and alternate events for the same payment create one receipt.
- Browser accounts cannot forge, alter or delete Stripe receipts, or alter protected invoice fields. Internal notes can still be edited.
- A failed public submission leaves its token usable; a successful submission consumes it once and updates onboarding status.
- The complete all-in-one setup reruns over existing records/files without removing them; the bucket stays private; owner-path Storage policies block cross-owner access/insertion.

## Logic and handler regression coverage

Monthly deadlines including short months/leap years; identical browser/server planning; legacy manual task-ID recognition; inactive exclusions; no invoice-collection tasks; 90-day message rotation; conversion idempotency; shared template IDs and completion semantics; field-level merge and delete/edit conflicts; JSONB key reordering; form edit conflicts; signed Stripe events; linked native invoice payments; approval fingerprints/acknowledgements; backups, relational patches and existing analytics/import logic.

## Not verified here

- **Actual browser rendering and mobile visual behavior:** local Chromium could not launch under environment restrictions, and the provided browser could not access the local app. No screenshot or browser-automation pass is claimed. jsdom tests exercise the mounted application but do not calculate real CSS layout or replace browser testing.
- **Live Supabase:** authentication provider, deployed migrations, concurrent PostgreSQL sessions, PostgREST routing and actual Storage service. PGlite tests use emulated Supabase auth roles/schema and test owner policies, not the hosted service.
- **Live Stripe:** test-mode checkout, real event delivery/retries, dashboard invoice metadata and production payment processing. These require the configured staging accounts.
- **Netlify schedules, Resend delivery, real backup restore and PWA behavior on devices.**

## Known remaining limits

- Stripe integration handles completed matching Checkout payments and explicitly linked full native invoice-payment events. It does not import an entire Stripe account, backfill historical invoices, track partial-payment progress, refunds, disputes, credit notes, fees or subscription administration. Gross collections include recorded VAT. Keep Stripe as the financial authority and reconcile these cases there.
- Existing manual financial records and historical duplicate template records are preserved. Ambiguous duplicate manual receipts are not automatically deleted or guessed from amounts/names.
- Older Delivered retainer records without a cycle are not silently restarted. Use Prepare current month to resume an intended ongoing retainer; no past due dates or historical tasks are rewritten.
- True same-field concurrent edits require a user choice. Recovery drafts are scoped to the current browser tab; they survive reloads, not necessarily closing the tab or clearing storage. Export backups remain important.
- Storage upload/delete and workspace metadata are separate service operations. Metadata is queued with the recovery draft; do not close before Cloud data saved. A service interruption after deleting a file can leave its old reference visible until the queued metadata saves; deleting again is safe. Database backups do not include file bytes.
- Existing approval links may need reissuing after the new fingerprint fields. Public acceptance creates the linked workflow when the app next loads/refreshes.
- Vite reports a large main chunk (~1.1 MB before gzip), inherited largely from the chart/application bundle. This is a build warning, not a failed build; no risky dependency rewrite was introduced for this update.

Follow the staging smoke checklist in `DEPLOY-START-HERE.md` before relying on this version with live agency work.
