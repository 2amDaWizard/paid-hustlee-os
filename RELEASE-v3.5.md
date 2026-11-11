# v3.5 — personal agency workflow and reliability

Incremental source update from the uploaded v3.4 package. No live client data, database or account was accessed or changed.

## Requested improvements

| Request | Implementation |
| --- | --- |
| Move Automations | Settings disclosure; existing six internal rules remain available. Invoice collection rule intentionally retired for Stripe ownership. |
| Remove Document Vault | No standalone page or sidebar entry. Existing operation metadata and storage objects retained. Unassigned/orphaned file references available in Settings. |
| Project agreements | Collapsible section; existing private bucket; 10 MB limit and type allowlist; 120-second signed view, authenticated download, confirmed removal. Metadata tombstone retained after deletion. Available on archived project views. |
| Lead sources | Cold Outreach, Referral, Google Maps, Instagram, Website, Inbound, Other. Existing arbitrary source strings remain editable under Other. |
| Lead import | Sales Pipeline button uses the existing single CSV handler/input; original deduplication retained. |
| Active statistics | Unique non-archived clients with active linked projects; active projects; active retainer projects. Completed/cancelled/inactive/archived/paused/on-hold/ended/closed projects excluded. Retainers identified by project deal type or Active Retainer stage, counted once. Historical lists remain accessible. |
| Space/readability | Larger project cards/board columns, task rows, client cards, full-width working area and responsive wrap rules. Custom stage columns stay horizontal. Visual browser QA remains pending. |
| Daily motivation | 90 original brief curated messages; deterministic by local calendar day, checked every 15 seconds while open. No API or tracking. |

## Reliability and connected work

- Cloud save acknowledgements come only from successful RPC results; edit toasts say queued/syncing. Tab-scoped recovery drafts, automatic retries and explicit same-field conflict resolution replace permanent blocking on the first failed write.
- Poll/focus refresh imports external changes. Owner/generation guards prevent responses from a previous session affecting a new one.
- SQL revision triggers cover server and browser writers. JSONB key ordering is not treated as an edit.
- Monthly retainer deadlines keep the intended day in the new month, clamping to February/short-month ends. Browser and scheduled jobs use one planner and the same task IDs. Legacy manual-generation IDs are recognized.
- Reusable templates create only actionable tasks; existing titles across tasks/milestones/deliverables prevent duplicates. Existing historical triples are not deleted. Reusable templates do not share completion between different projects. Retainer task/checklist completion is linked for the current month.
- Deleted auto-generated tasks are remembered to avoid recreating them from the same trigger.
- Stripe receipts are atomic, deduplicated and protected in the database and UI. Invoices, reminders and receipts stay Stripe-owned; historical collection tasks are not silently removed. Manual invoice Paid statuses do not generate revenue.
- Public-link consumption, receipt creation and source status updates are atomic. Agreement type and end date join the approval fingerprint. Existing approval links may require reissuing because their fingerprint predates these fields.
- Existing TypeScript errors in the Supabase promise handling and handover category check are fixed.

## Main workflow

1. Open a lead and choose **Prepare proposal**. Contact/value/currency/scope are carried into one linked draft. Marking it Sent advances an eligible lead to Proposal Sent.
2. Accept the proposal (manually or through its public approval). The app prepares one linked client/project/onboarding. Existing unambiguous client matches are reused. No payment is inferred. Public acceptance is reconciled when the workspace next loads or refreshes.
3. Completing onboarding moves an Onboarding project to In Progress. Checklist templates add one task per new step. Project completion retains the existing single handover workflow.
4. An accepted proposal offers **Prepare payment reference**, preserving its amount, client and project. Use Stripe Checkout or an explicitly linked native Stripe invoice for collection.
5. An accepted proposal with an agreement end date creates one renewal record. Renewal reminders remain internal; the CRM never renews a contract or charges a client automatically.

A direct lead conversion is still available. Historical Closed Won leads without a conversion mapping are not reconverted automatically. A declined/revised proposal should be reviewed rather than silently creating new sales work. No employees, timesheets or enterprise features were introduced.

## Limits

See `TEST-RESULTS.md` for evidence, and `DEPLOY-START-HERE.md` for service validation and financial boundaries. This package is implemented and locally tested, not a claim of production certification. No live Stripe payments, Storage operations, Supabase deployment, email delivery, mobile-browser or visual browser checks were completed in this environment.
