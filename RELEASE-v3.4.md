# PAID HUSTLE OS v3.4 — development release and validation notes

This package is **real source code**, not a demonstration picture. It expands the v3.3 application toward the owner's 39 approved features. **It is not accurate to call all 39 fully complete or production-validated.** Details in FEATURE-STATUS.md. Standby/rejected proposals are intentionally not implemented.

## Material additions since v3.3

- **Agency Intelligence page**: interactive CRM funnel, win/loss analysis, stage-weighted pipeline estimates grouped by currency, 30/90-day expected cash flow, aging of unpaid recorded transactions, explicit invoice VAT estimates, client health and delivery reports.
- **Sales outreach planner**: creates four dated manual outreach tasks, with consent-friendly descriptions, idempotent for each lead; never automatically sends prospecting emails.
- **Apply project templates**: converts a saved operations template into linked tasks, milestones and deliverables, avoiding repeated milestone titles.
- **Automatic internal workflow execution**: runs the seven existing idempotent rules when an authenticated workspace is open. Optionally, a separate scheduled Netlify function generates the same internal actions daily (requires owner ID and server Supabase secrets).
- **Command search quick actions**: new client, lead, task, project, transaction, go to intelligence or automations.
- **Invoice VAT rate**: optional per-invoice VAT on top of the recorded subtotal; the Checkout session and Stripe webhook both use the gross VAT-inclusive amount. Payment state still depends solely on verified Stripe webhook events.
- **Public approval response**: clients can view the saved scope, acknowledge it, type their name and approve or request changes. Review hash detects changes since link creation; a positive acknowledgement can mark linked proposal/QA/report/handover/document records approved. This is NOT an identity-verified qualified e-signature.
- **Cloud backup restore**: settings can download or restore the optional protected server snapshots with validation and two confirmations. The optional cloud backup server job must be configured.
- **Safer cloud syncing**: drains edits that arrive while a save is finishing instead of silently leaving them pending.
- **One Supabase setup SQL file**: `supabase/PAID-HUSTLE-ALL-IN-ONE-SETUP.sql` combines the relational schema, RLS, private storage, public links, Stripe event journal and backup/notification tables.
- **Source pre-build validator**: Netlify errors clearly explain when a GitHub upload omitted `src/` or another required file.

## Tests performed in this environment

- 27 automated Node tests passed (CRM and financial analysis, template application, outreach cadence, scheduled rule idempotency, single-use intake and approval, signed Stripe webhook, VAT/gross transaction reconciliation, JSON backup validation, data diffing).
- TypeScript and TSX syntax parsed cleanly with installed TypeScript parser.
- Every Netlify `.mjs` passed `node --check`.
- GitHub-upload source validator passed on this extracted package.
- ZIP CRC and member-path checks are performed during packaging.

**What cannot be claimed:** This offline environment cannot download dependencies, so `npm run typecheck`, `npm run build` (Vite), browser UI, real Supabase PostgreSQL/RLS integrations, actual Netlify functions, Stripe payment and Resend delivery have not been live-tested. Run the supplied GitHub CI and a Netlify test deploy before treating this as safe for your business.

## Setup without migrating any older client data

1. In your chosen Supabase project, run **the entire** `supabase/PAID-HUSTLE-ALL-IN-ONE-SETUP.sql` in SQL Editor. The final row should show true for all checks. This does not drop `public.workspaces`; the new `agency_*` tables start empty.
2. Deploy the extracted **contents** of this ZIP at your GitHub repository root. Verify `src/main.tsx` really exists in GitHub. Netlify build: `npm run build`, publish `dist`.
3. On the **new test Netlify site** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from that exact Supabase project. These are public frontend values. Never put the service-role key or Stripe secret into `VITE_` variables.
4. Sign in using a user created under Supabase Authentication in that project. Optional: import your existing JSON via Settings → Import backup; otherwise start with empty tables.
5. After the base app works, set optional server-only variables as described in `DEPLOY-START-HERE.md` and perform separate tests for Stripe, links, private files, backups and emails.

## External account configuration (not included in the ZIP)

- Supabase project/auth, plus server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for Netlify functions.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for Stripe Checkout / payment webhooks. Set the webhook URL to `https://YOUR_SITE/.netlify/functions/stripe-webhook` and enable `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- `RESEND_API_KEY`, `EMAIL_FROM`, `AGENCY_NOTIFICATION_EMAIL`, and `AGENCY_OWNER_ID` for owner-only daily emails. Sender domain must be verified with Resend. This app does not auto-send client prospecting emails.
- `AGENCY_OWNER_ID` is also needed for optional scheduled server workflows. It should be the Supabase Auth user's UUID. Netlify schedule is configured for 05:30 UTC daily and the workflow uses Copenhagen calendar days.

## Important limits

- External Stripe/email services will not work merely by deploying the ZIP; credentials and provider setup are mandatory.
- Booking forms collect **requests**, not confirmed calendar availability.
- Client approvals are recorded acknowledgements, not a legally qualified digital signature service.
- The document vault depends on Supabase Storage policies and real upload testing.
- No claim of complete all-39 production readiness is made.
