# Strategy Scale — Clean Workspace Design Preview (v4 candidate)

## Reference & direction

A complete light visual treatment based on the **user-supplied CleanOS screenshot**, adapting its warm off-white canvas, floating white sidebar, minimal iconography, high-contrast type, thin borders, subtle rounded cards, and restrained green status cues. This is an independently authored UI treatment, **not copied Framer source code**. The CRM is more information-dense than the portfolio reference intentionally.

## What was actually edited in the React source

- `src/styles.css`: app-wide light design system and targeted restyling across dashboards, project hubs, Kanban, tasks, pipeline, sales, operations, finance, analytics, settings, log-in screens, forms, and modals.
- `src/App.tsx`: quieter home headline, compact high-priority sidebar, secondary tools behind a disclosure, and a single global **New** menu (lead, client, project, task, transaction); retains previous views and features.
- `index.html` + `public/manifest.webmanifest`: Strategy Scale browser/PWA title and light theme. Retains the existing purple app artwork and favicon files.
- `public/sw.js`: versioned cache key for new theme assets.
- `tests/branding.test.mjs`: branding assertions updated to the selected name.

## What was NOT changed

- Business records and database schema.
- Supabase authentication, API endpoints, Stripe, backend workflows, stored documents, migrations, or security policies.
- Existing CRM features, data keys, financial calculations, or your source of truth for payments.

## Verification

- 41/41 available non-database Node tests pass on Node 22.16.0.
- All 28 TypeScript/TSX modules parsed with the TypeScript compiler without syntax errors.
- CSS stylesheet passed a syntax parse.
- Source structure check passed.
- **Not tested:** production Vite build, TypeScript typecheck, mounted React UI/mobile screenshots, Supabase database test, live Stripe/Supabase integrations. Dependency installation was unavailable/timed out in this runtime. This package is a **staging review candidate, not production-approved**.

## Before publishing

1. Back up your currently deployed repository, Supabase tables, and Storage objects.
2. Compare the included source with your **current** GitHub repository: this starts from the saved Strategy Scale v3.5 source snapshot, which may be older than your live files.
3. Deploy to a separate Netlify site and a disposable/test Supabase project first. Do not copy production keys or import your full JSON backup into a testing app.
4. Install packages using Node 24, then run `npm ci`, `npm run check`, and verify desktop/mobile navigation, quick-create actions, project details, CSV import, and all saved data behaviors.
5. Publish only after manual visual checks and integration testing pass.

This is the actual React application source with the new design, **not a fake HTML preview**.
