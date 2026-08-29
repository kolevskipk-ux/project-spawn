# Project Spawn

GitHub-backed Cloudflare Worker that performs three-hourly discovery windows, maintains durable inventory and a review-gated published catalog in D1, and serves protected operator views.

The post-review responsibility boundary is documented in `SPAWN_CONTRACT.md`.

## Architecture

`Cloudflare Cron → Worker → OpenAI Responses API + web search → D1 review lifecycle → published catalog`

Spawn sends no customer Discord messages. Catch Em All owns deterministic monitoring and customer delivery, including the deduplicated `NOW TRACKING` acknowledgement after an operator-approved record is published and consumed.

When independent verification reaches `VERIFIED`, Spawn sends a deduplicated review request only to `OPS_DISCORD_WEBHOOK_URL`. An optional `APPROVAL_DISCORD_ROLE_ID` pings the designated admin group so another administrator can review when the primary operator is unavailable. Missing or failed delivery remains pending for hourly retry and never falls back to a customer webhook.

GitHub `main` is the source of truth. Cloudflare Workers Builds deploys commits from the repository. D1 is operational state, not source code.

Production hostname: `https://spawn.aztlan-eng.com`. The custom domain is declared in `wrangler.jsonc`; do not create conflicting DNS records manually.

Discoveries, verification evidence, rejected candidates, blocked sources, and model output remain private in D1, the protected dashboard, and Worker logs.

## One-time setup

1. Create an empty private GitHub repository named `project-spawn`.
2. Commit and push this project to its `main` branch.
3. Install dependencies with `pnpm install`, then run `pnpm run check`.
4. Log in to Cloudflare from this folder with `npx wrangler login`.
5. Create D1: `npx wrangler d1 create project-spawn`.
6. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the returned database ID and commit that change.
7. Add production secrets (each command prompts securely):
   - `npx wrangler secret put OPENAI_API_KEY`
   - `npx wrangler secret put RUN_TOKEN`
   - `npx wrangler secret put BOARD_ACCESS_TOKEN`
   - `npx wrangler secret put OPS_DISCORD_WEBHOOK_URL`
   - optionally configure `APPROVAL_DISCORD_ROLE_ID` for an admin-role mention
   - `npx wrangler secret put CATCH_INGEST_SECRET`
8. Apply the schema once: `pnpm run db:migrate:remote`.
9. In Cloudflare: **Workers & Pages → Create application → Import a repository**. Select the GitHub repository and production branch `main`.
10. Confirm the Worker name is `project-spawn`. Use deploy command `pnpm run deploy`. Save and deploy.
11. Open `https://project-spawn.<your-subdomain>.workers.dev/healthz` and `/readyz`.
12. Trigger the first scan with `POST /run` and header `Authorization: Bearer <RUN_TOKEN>`.

The cron is `5 * * * *` (five minutes after every UTC hour). Routine scans are skipped during the configurable `SPAWN_QUIET_START`–`SPAWN_QUIET_END` window (defaults `02:05`–`06:05`) in `SPAWN_TIMEZONE`; manual scans remain available and the 6:05 local run resumes automatically. Display timestamps use `America/Mexico_City`, so the schedule is not tied to a fixed UTC offset.

Migration `0006_garfield_shared_state.sql` adds the shared reversible vendor registry/audit trail, normalized monitoring-candidate inbox, and `inventory.print_series`. Apply it before deploying either updated worker. Vendor Issue links are scoped to the existing 30-day alert token; when Cloudflare Access supplies `Cf-Access-Authenticated-User-Email`, it is stored as the reporter. Protect the public hostname/route with Access if reporter identity must be mandatory.

Catch Em All reads `/internal/garfield/vendors` and `/internal/garfield/monitoring-candidates` using the existing `CATCH_INGEST_SECRET`, caches the last successful snapshot for five minutes, and fails open to that cache if Spawn is unavailable. Vendor Issue buttons create review records instead of immediately applying a global block. Approve or reject with `PUT /admin/vendor-issues/<id>`, bearer `RUN_TOKEN`, and JSON `{ "decision":"APPROVED"|"REJECTED", "reason":"..." }`. Reinstate a vendor with `PUT /admin/vendors/<normalized-vendor-key>` and JSON `{ "status":"ACTIVE", "reason":"..." }`.

The private `/dashboard?access=...` page combines the Amazon verification queue and evidence-bound Verify, Approve, Reject, and Publish controls with Spawn health, scan freshness, inventory/error counts, vendor state, weekly feedback trends, and Catch Em All `/status.json` on demand. Approval and publication require the latest immutable evidence revision, preventing stale dashboard actions. It performs no background polling. `/inventory.csv` includes backward-compatible `print_series` and `availability_state` columns.

Every genuinely new in-scope listing enters the dashboard's New listing publication queue. The operator may publish it for customer visibility only, publish an independently verified Amazon ASIN with hourly monitoring, promote a high-demand verified Amazon ASIN to five-minute monitoring, or reject it. Catch owns the deduplicated customer notice and recurring monitoring; Spawn never posts to customer Discord routes.

Every Friday around 10:05 `America/Mexico_City`, the existing hourly trigger idempotently posts one low-friction weekly Discord survey. Responses are anonymous per browser receipt and stored by ISO week for trend analysis. Migration `0009_release_feedback_and_availability.sql` adds the survey, placeholder, normalized product-type, and review-queue storage.

KantoCards is evaluation-only, not Always Scan. Its Delta Reign `$1.00` + `PREVENTA PRÓXIMAMENTE` + `Agotado` combination is recorded as `preorder_placeholder`; that nominal price is excluded from benchmarking and does not create historical sold-out state. Promote the retailer to Always Scan only after an operator reviews reliability over multiple observations.

## Safe release and rollback

- Work on a branch and open a pull request. Merge only after `pnpm run check` passes.
- Database migrations are committed, numbered, and forward-only. Prefer additive schema changes so an older Worker remains compatible.
- Roll back code in **Cloudflare → Worker → Deployments → Version history → Deploy version**, or revert the GitHub commit. Then fix `main` so repository truth matches production.
- Never put API keys or webhook URLs in GitHub. They are Cloudflare Worker secrets.
- A code rollback does not roll back D1 data or schema. Take a D1 backup/export before destructive migrations.

## Health contract

- `GET /healthz`: process is serving traffic; no dependency checks.
- `GET /readyz`: minimal public D1 reachability check.
- `GET /version`: minimal public configuration version.
- `GET /admin/status`: bearer-protected version, readiness, lock, cooldown, and recent-scan diagnostics.
- `GET /inventory?access=...`: protected read-only Inventory Board.
- `GET /inventory.csv?access=...`: protected Excel/CSV export.
- `POST /run`: authenticated manual scan for smoke tests and recovery.
- `POST /internal/benchmark-candidates`: signed Catch Em All price-observation intake; candidates remain pending until reviewed.

## Catch Em All integration

Catch Em All can submit signed Amazon México price observations to Spawn's durable benchmark-candidate inbox. The integration is one-way and review-gated; automated observations cannot overwrite curated benchmark prices. See `CATCH_INTEGRATION.md`.

## Updating the watch list

Edit `src/config.ts` in a pull request and increment `SPAWN_CONFIG_VERSION` in `wrangler.jsonc`. This makes scan history auditable.
