# Operations runbook

Customer inventory events are durable D1 records. `GET /internal/garfield/customer-events` and `POST /internal/garfield/customer-events/ack` require `CATCH_INGEST_SECRET`. Deployment does not activate customer delivery: Catch owns its separately gated consumer and Discord routes.

## Discord is quiet

1. Check `/healthz`, then `/readyz`.
2. Inspect Cloudflare Worker logs for `scheduled scan failed`.
3. Check recent D1 rows: `npx wrangler d1 execute project-spawn --remote --command "SELECT id, started_at, status, error FROM scan_runs ORDER BY started_at DESC LIMIT 10"`.
4. Run an authenticated `POST /run`. A 502 response distinguishes OpenAI or Discord failures.
5. If a recent release caused the failure, deploy the previous version in Cloudflare and revert the corresponding GitHub commit.

Use the bearer-protected `/admin/status` endpoint for detailed readiness and recent scan diagnostics. Public `/readyz` intentionally returns only healthy or unhealthy.

## Secret rotation

Set the replacement with `wrangler secret put`, run a manual scan, and only then revoke the old credential at its provider.

Manual scans are globally serialized and limited to one accepted start every 15 minutes. A rejected manual run does not call OpenAI or post to Discord.

## Database changes

Create a numbered migration, test it locally, back up/export production D1, and keep the migration backward-compatible with the currently deployed Worker. Do not edit a migration after it has reached production.

Before material maintenance, retrieve and record a D1 Time Travel bookmark. Follow `SECURITY.md`; never add a public reset or general-purpose database endpoint.

## Inventory Board access

- The board is read-only and protected by `BOARD_ACCESS_TOKEN` during private review.
- Treat the full access URL as a shared secret. Anyone with the URL can view the board.
- Rotate the token immediately if the link is posted outside the intended audience.
- Do not pin the shared-token URL for paid or membership access. Replace it with Discord role-based authentication or another identity-aware access policy first.

## Pricing references

Availability scans never overwrite curated Amazon launch or Collectr references. Follow `PRICING_CATALOG.md`, preserve source URLs and capture dates, and label comparable launch values as proxies.

Catch Em All observations enter `benchmark_candidates` as pending evidence and cannot overwrite `products`. Follow `CATCH_INTEGRATION.md`. Review candidate identity and seller evidence before approval.

## Tester review

Use `TESTER_REVIEW.md` for the seven-day protocol. Preserve historical observations when correcting current inventory; do not delete evidence merely to improve review metrics.

## Seed intake and remembered-inventory validation

Apply migration `0018_seed_campaigns_and_revalidation.sql` to the isolated development D1 before uploading the corresponding Worker build. Do not apply it to production as part of an ordinary Worker deployment.

The bulk seed endpoint is `POST /admin/seed-campaigns` with the existing `RUN_TOKEN` bearer credential and `application/json`. Never put the token in a URL, log, fixture, or repository file. Inspect per-item `ACCEPTED`, `DUPLICATE`, and `REJECTED` receipts plus the durable campaign totals before running verification.

Development-only validation uses the protected `POST /admin/seed-verification/run` and `POST /admin/revalidation/run` diagnostics. `wrangler.dev.jsonc` has no cron; each call is operator-triggered and bounded. Confirm that Catch-owned ASINs are excluded, only one listing per domain is selected, `ERROR`/`BLOCKED`/`UNKNOWN` preserve inventory, and no customer delivery occurs.

Production seed verification was approved after the 2026-09-03 isolated gate and runs at a maximum of two `DISCOVERED` ASINs per invocation. Valid unresolved Amazon identities become operator-review eligible; blocks, transport failures, redirects, and identity mismatches remain closed. Verification never publishes inventory or enrolls Catch. `INVENTORY_REVALIDATION_ENABLED` remains `false`. Never reset inventory baselines or delete observation history during validation.

Bulk `codex_seed` campaigns remain visible in `/approvals` but are excluded from ordinary per-item Discord retry delivery. Complete campaign review in the protected workspace and use the separately reviewed aggregate publication path; do not turn a large seed batch into a Discord notification burst.
