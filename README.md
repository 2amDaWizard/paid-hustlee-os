# PAID HUSTLE OS v3.5

An incremental update to the supplied v3.4 personal-agency CRM. React, TypeScript, Vite, Supabase and Netlify are retained. Dark branding and existing workspace records are preserved.

**Start with `DEPLOY-START-HERE.md`.** Existing installations need `supabase/migrations/3.5-reliability.sql` before the new server functions go live. Fresh installations use the updated all-in-one SQL file. Nothing has been deployed to your live services.

## Local use

Use Node.js 24:

```sh
npm ci --no-audit --no-fund
npm run check
npm run dev
```

Without frontend Supabase variables, the app is a browser-only preview. With them, authentication remains required and private files use the existing owner-scoped bucket. The ZIP contains no client data or credentials.

## What changed

- Automations live in Settings. The standalone Document Vault is removed; existing document records and objects remain accessible.
- Each project, including archived projects, has a compact Agreements disclosure with private upload, view, download and confirmed removal.
- Lead-source dropdown with custom Other; CSV import directly on Sales Pipeline.
- Active-client/project/retainer counts derive from active linked delivery, not historical totals.
- Wider project cards, larger task rows and readable client cards, with mobile breakpoints retained. Ninety curated daily sidebar messages.
- Confirmed cloud-save status, bounded automatic retries, per-owner tab recovery drafts, field-level merge and explicit conflict choices. Background updates refresh while the app is open.
- One shared monthly-task planner for browser and scheduled jobs; month-end dates clamp safely. Templates create tasks only and recognize existing work.
- No CRM-generated invoice-collection tasks. Signed Stripe payments use one atomic database transaction and immutable receipts.
- Lead → proposal → accepted client/project/onboarding, onboarding → delivery, accepted proposal → payment reference, optional agreement end → renewal.
- Public client submissions are atomic with token consumption and linked status updates.

See `RELEASE-v3.5.md`, `FEATURE-STATUS.md`, and `TEST-RESULTS.md` for exact scope and limitations. Passing local tests is not certification of your live Supabase, Stripe, Storage, email or Netlify deployment.
