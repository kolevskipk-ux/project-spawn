# Operations runbook

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
