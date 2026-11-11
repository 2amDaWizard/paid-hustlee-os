# PAID HUSTLE OS v3.5 — Proposal ID collision fix

This is the supplied v3.5 source with one targeted regression fix applied. The rest of the v3.5 implementation is not changed.

## Fixed

`src/workflow.ts`: Preparing a new proposal after a prior proposal for the same lead was Declined or Cancelled no longer reuses the historical `proposal:<leadId>` ID. The first attempt retains the legacy ID; later attempts receive deterministic unique IDs (`:2`, `:3`, …). Historical proposals remain intact.

`tests/reliability.test.mjs`: Added a regression test covering Declined → new proposal, active-proposal reuse, Cancelled → third proposal, and preservation of unique IDs.

## Verification performed in this environment

- 38/38 tests that do not require the database dependency passed using the included Node test scripts.
- 10/10 reliability tests, including the new regression test, passed.
- The supplied v3.5 package itself reports that 40 server/database tests, 8 mounted app tests, type checking, and build passed in its original environment. **Those reports were not independently reproduced here.**
- The PostgreSQL/PGlite tests, Vite build, and TypeScript compile could not be rerun because the environment has Node 22 (the supplied project requires Node 24) and cannot download missing npm dependencies. `npm ci --offline` stops at an uncached package.
- An offline, clickable *illustrative* visual preview is provided separately. It is not a render of the React app and is not included as evidence of browser-app functionality.

## Before deployment

Do **not** deploy to your live CRM on the strength of these partial checks. Use Node 24 and run `npm ci && npm run check` in a properly connected build environment. Follow `DEPLOY-START-HERE.md`, back up Supabase records and file storage, apply the v3.5 migration in staging, and test actual browser rendering plus Supabase/Stripe operations. No live CRM or accounts were accessed or changed when creating this package.
