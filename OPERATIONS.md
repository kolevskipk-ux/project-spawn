# Operations runbook

## Discord is quiet

1. Check `/healthz`, then `/readyz`.
2. Inspect Cloudflare Worker logs for `scheduled scan failed`.
3. Check recent D1 rows: `npx wrangler d1 execute project-spawn --remote --command "SELECT id, started_at, status, error FROM scan_runs ORDER BY started_at DESC LIMIT 10"`.
4. Run an authenticated `POST /run`. A 502 response distinguishes OpenAI or Discord failures.
5. If a recent release caused the failure, deploy the previous version in Cloudflare and revert the corresponding GitHub commit.

## Secret rotation

Set the replacement with `wrangler secret put`, run a manual scan, and only then revoke the old credential at its provider.

## Database changes

Create a numbered migration, test it locally, back up/export production D1, and keep the migration backward-compatible with the currently deployed Worker. Do not edit a migration after it has reached production.
