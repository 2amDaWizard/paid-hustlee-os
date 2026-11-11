# Deploy PAID HUSTLE OS v3.5

## Upgrade an existing v3.4 installation

1. Export a current JSON backup and retain the original v3.4 source ZIP. Use a test/staging Supabase project first. A JSON backup contains file references, not the uploaded file bytes; retain your Storage backup too.
2. Close old application tabs during the upgrade. Apply `supabase/migrations/3.5-reliability.sql` in the SQL Editor of the same Supabase project used by the CRM. It requires the v3.4 relational, Stripe and public-link tables. If those optional tables were never installed, apply the included `stripe-integration.sql` and `public-client-links.sql` first. Apply `private-document-storage.sql` if the private bucket was never configured.
3. The migration adds revision-lock triggers, read-only Stripe receipt protection, atomic payment reconciliation and atomic public submissions. It sets the existing document bucket private. It does **not** delete, rename or rewrite client/project/task/financial records or move storage files. It can be run twice safely.
4. Deploy the complete source folder, including `netlify/functions`, `netlify/lib`, `src`, SQL, `package.json`, and the included lockfile. Netlify builds `dist` using Node.js 24. Do not drag only `dist` onto Netlify: that omits the server functions.
5. Keep the existing project URL and publishable key. Preserve server-only secrets. Never place the service-role or Stripe secret key in a `VITE_` variable.
6. Run the smoke checklist below in staging. Then deploy the same verified version against your intended production configuration. Reopen the CRM and confirm Cloud data saved.

**Apply the migration before deploying the new functions.** The webhook and public-link handlers now require the new atomic RPCs; without them these actions return an error rather than pretending to succeed.

## Fresh installation

Run the complete `supabase/PAID-HUSTLE-ALL-IN-ONE-SETUP.sql`, which now includes the 3.5 migration. Do not use a fresh/empty project as a substitute for migrating your existing production project. Older pre-relational `workspaces` data is left untouched; this script does not silently import that legacy table.

## Environment

Frontend (Netlify build variables):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server functions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` for payments
- Optional scheduled workflows: `AGENCY_OWNER_ID`
- Optional owner digest: existing Resend/recipient/sender variables listed in `.env.example`

No new secret variables are introduced. `NODE_VERSION=24` is included in netlify.toml.

## Stripe setup and reporting boundaries

Keep Stripe responsible for invoices, reminders, receipts, refunds and actual payment collection. The CRM creates no collection emails or overdue-invoice tasks.

Configure the webhook endpoint `https://YOUR-SITE/.netlify/functions/stripe-webhook` for:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.payment_succeeded` if using native Stripe invoices

Checkout created from the CRM supplies the owner and record metadata automatically. Native Stripe invoices must have metadata `owner_id` = the CRM owner's Supabase UUID and `record_id` = the saved CRM invoice-reference ID. Use the corresponding reference for each invoice; do not map one payment through both a native invoice and a separate Checkout. This is explicit invoice linking, not a whole-account Stripe import.

The gross amount including recorded VAT and the currency must match. Mismatches fail without changing the invoice, receipt or event marker. Duplicate events and multiple event types for the same payment ID produce one receipt. A browser success redirect cannot mark payment paid. Manual invoice statuses never create income transactions.

Historical/manual transactions stay intact and are clearly described. Do not manually enter a receipt already imported from Stripe; ambiguous historical duplicates cannot be matched safely. The financial totals are gross collections (including VAT where charged), not tax-exclusive revenue. Native partial-payment progress, refunds, disputes, credits, fees, subscription administration and automatic historic backfill are **not implemented**. Reconcile those cases with Stripe; this release is not a complete accounting ledger.

## Staging smoke checklist — still required on your services

- Sign in/out; verify that a second account cannot read the first owner's records or files.
- Import a small CSV; test Other lead source; accept a test proposal; verify exactly one linked client/project/onboarding. Finish onboarding; verify delivery stage.
- Use Prepare payment reference; create Checkout with test credentials; pay using Stripe test mode. Confirm exactly one immutable receipt, matching gross amount, and automatic refresh in the open CRM. Replay the webhook.
- Test a native invoice only if that route is configured; verify metadata and amount reconciliation.
- Upload/view/download a harmless agreement; archive the project; open it from Settings and verify access. Test removal only on that disposable agreement.
- Disconnect/reconnect the network around a save. Verify edits survive and Cloud data saved appears only after confirmation. Edit different fields in two tabs, then the same field to test conflict choices.
- Submit a public approval/intake; verify the linked record and receipt. Replay the used link and verify it cannot be used twice. New proposal links include the agreement type/end date in their review fingerprint.
- Inspect desktop and mobile layouts in actual browsers (including iOS/Safari if used). Browser visual testing was blocked in the implementation environment.
- Verify a restore in a disposable staging project. Browser restores cannot modify/delete protected Stripe receipts; do not restore an older snapshot over newer receipts. Restore financial history administratively from a verified backup if required.

## Recovery and rollback

Unsaved cloud changes are kept in an owner-specific `sessionStorage` draft in the same tab and survive reloads. They are not a device backup and may not survive closing the tab, clearing browser storage or device failure. The app warns before leaving with unconfirmed changes. Export a JSON backup if storage is unavailable.

Transient errors retry automatically (up to a 30-second interval), on reconnection and with Retry now. True same-field conflicts require a choice. Independent changes merge, including JSONB object-key ordering. Do not disable row-level security to resolve an error.

Keep the 3.5 migration in place when investigating an issue; it is additive and preserves records. Prefer fixing forward. An older v3.4 server handler is incompatible with the new receipt guard and should not be used to roll back payments. Disable the affected integration temporarily in staging while diagnosing rather than dropping tables or removing protections.
