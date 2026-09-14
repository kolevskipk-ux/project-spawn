# Mercado Libre browser reporting to Spawn

Deployed with Philip's approval on 2026-09-13. Extension version 0.4.0.

Production migration 0042 applied successfully. Code release `044f8ad` was built
from an isolated worktree, excluding unrelated local edits. Worker code deployment
was `090418eb-c76c-4e0f-91c2-cf40e5617613`; the subsequent separate secret change
activated version `e391d6b2-327e-4432-a312-33bdcff694e0`.
The installed extension folder has the scoped credential; repository copies stay
empty. Authenticated status returned 200, unauthenticated intake 401, malformed
authenticated intake 400. No synthetic observations were inserted. A real
extension receipt remains pending the user's extension reload and next check.

The existing browser checks can send observations to Spawn rather than retaining
them solely in local extension storage. This is not an integration with Mercado
Libre's native Notify Me service, and it does not send Discord/customer alerts.

## Behavior

- POST `/internal/mercadolibre-browser/observe` accepts only the five existing
  target IDs and their approved direct/catalog URLs with a separate bearer token.
- GET `/internal/mercadolibre-browser/status` uses the same credential and returns
  latest observations, last verified observations and their age for all five targets.
- Migration `0042_mercadolibre_browser_observations.sql` creates separate durable
  receipts. Reusing an ID with changed normalized content returns 409. Out-of-order
  delivery does not change which check is displayed as latest.
- Credentials cannot reuse Walmart's token. Missing configuration leaves the
  extension in local-only mode. HTTP failures remain visible in local history;
  there is no automatic replay of old checks. The next scheduled check tries again.
- `pageAvailability=sold_out` retains state=unknown when the original seller/offer
  is not verified. The backend owns seller policy, not the client. No numeric seller
  IDs are approved yet, so current intake rejects any purported verified state.
- No inventory updates or customer events are generated, including for missing
  tabs or blocked pages. There are no new server cron jobs.
- Only normalized product evidence is stored. Advertising parameters, raw page
  contents, unknown request fields and account data are not persisted.

## Local verification

TypeScript compilation passes. Eight new backend/transport tests and six existing
Walmart tests pass (the local release artifact also contains a duplicate Walmart
suite). Twenty-one isolated Edge extraction cases, scheduling/lease tests and
popup startup/stalled-worker tests pass. All fixture browser requests are intercepted.
The isolated full release suite also passed: 302 tests, one skipped. Production
authentication and validation were checked; real browser delivery remains pending.

## Approved rollout sequence

1. Obtain production approval for the migration, Worker release, and new credential.
2. Build an isolated release from the production baseline plus these changes;
   do not include unrelated `src/approved-inventory-operations.ts` edits or artifacts.
3. Apply only migration 0042 to production, as a distinct operation.
4. Deploy the Worker containing the new route, as a distinct operation.
5. Provision a newly generated MERCADOLIBRE_COLLECTOR_TOKEN secret, distinct from
   Walmart. Put the same value in the installed extension's
   `mercadolibre-private-config.js` without printing or committing it.
6. Update extension runtime files without overwriting its private config files,
   reload it, and run one manual check on an approved product page.
7. Confirm the popup says Saved to Spawn and verify the matching receipt in
   production. This real receipt is the end-to-end release check.
8. Keep the existing 30-minute extension schedule; no server cron activation.

The installed extension now has its credential; reload it to activate reporting.
Repository source credentials remain empty. Rollback: remove the ML credential from the installed extension and remove
the server secret; preserve observation history. Walmart's credential, schedules,
routes and existing data are unchanged.
