# v3.5 implementation status

`RELEASE-v3.5.md` is the current change inventory. `TEST-RESULTS.md` records verified scope. The previous release documentation remains in `RELEASE-v3.4.md` as historical context only.

| Area | Current status |
| --- | --- |
| Core UI, imports, lead/proposal/onboarding flow | Implemented; mounted React application interaction tests pass. |
| Sync recovery, lost acknowledgements, conflicts | Implemented; actual hook tested against controlled service responses. Live network/service verification pending. |
| Agreements | Implemented; component upload/view/download/removal paths tested against mocked Storage. Owner storage policies included; real Storage validation pending. |
| SQL migration | Executed twice in PGlite PostgreSQL with emulated Supabase roles; owner isolation, stale protection, payment guard, payment/public-response atomicity tested. Actual Supabase deployment pending. |
| Stripe | Checkout and explicitly linked full native invoice payments implemented. Signed handlers tested with mocked transport, atomic reconciliation tested in PostgreSQL. Real Stripe test-mode transaction pending. Refunds/partial payment tracking/backfill not included. |
| Automation | Shared browser/server planner tested, monthly dates corrected, collection reminders retired. Live Netlify schedules pending. |
| Visual/mobile polish | Responsive CSS implemented; rendered visual/browser verification blocked in this environment and remains required. |
| Existing optional services | Email digest, backups, booking requests and public links still require their existing infrastructure. No live activation performed. |

Manual tracking is labeled as such. No automatic client messaging, calendar-slot synchronization, e-signature certification, payroll or accounting integration is claimed.
