# Amazon Edge signal intake — activated September 21, 2026 (Mexico City)

Branch: `codex/amazon-browser-signals`, based on the clean cost-containment release 91280c7. Source release: 4dba0b3. Extension 0.3.0 source remains credential-free; the installed desktop copy and private laptop package are configured for reporting. The cloud browser cap and all pause flags remain unchanged.

## Activation evidence

Philip approved migration, separate deployment, credential setup and laptop packaging in this task. Migration 0046 was the only pending migration and applied in three commands. All 14 targets were verified published before deployment. Worker code version: eb72e8c9-6f9a-4be8-9664-1440b5a5f7ea; final secret-activated version: edf1a780-b1ef-4e57-a893-8360599eaef0. Previous Worker: 8c88fffb-8181-41ec-af8a-77623e2d1bdf.

Separate desktop and laptop credentials were provisioned through Wrangler; neither credential is committed. The server assigns collector identity from the credential, ignoring client identity claims. Either credential can be independently revoked. Both authenticated status requests returned 200 with 14 targets; malformed observations returned 400; unauthenticated status returned 401. Health and readiness returned 200. No synthetic observation was inserted. A genuine extension receipt remains pending the desktop reload or laptop installation and first check.

The private ZIP is `releases/Garfield-Amazon-Observer-Laptop-v0.3.0.zip`, outside this Git checkout, with eleven runtime/setup files and only the laptop-scoped credential. SHA-256: `2D6311605313036DC839A739FE4305ED0125F319C245F4E89CD2FE787267B26B`. Do not distribute publicly. Install by extracting and loading the folder containing manifest.json in Edge Developer mode.

Validation: TypeScript, 318 backend tests, 25 isolated Edge DOM cases, scheduler and notification transition tests, and dry-run build passed before activation. The additional laptop-authentication test passed before deployment. Source is recorded on the feature branch; no main-branch push was performed.

## Contract

`Edge observation -> /internal/amazon-browser/observe -> separate diagnostic receipts`

The explicit signal is **Buying options shown — click to see offers**. It proves only visibility of a control on an identity-matched product page. It is not `BUYABLE_VIA_OPTIONS`, an offer, or a verified restock. The extension never clicks the control. This signal does not enter Catch's signed inventory endpoint and the extension never receives `CATCH_INGEST_SECRET`.

The new intake mirrors the existing retailer collectors: a dedicated `AMAZON_COLLECTOR_TOKEN`, exact server-owned 14-ASIN allowlist, published 30th-category eligibility check, canonical URLs, bounded fields and timestamps, normalized receipts, and idempotent observation IDs. Unexpected fields, including prices, seller names, account data and client stock-authority claims, are discarded. Even local featured-offer classifications are diagnostic only in this first integration.

`GET /internal/amazon-browser/status` requires the same token and exposes latest evidence and its age for each target. Evidence older than 15 minutes is marked stale. This is an authenticated JSON status endpoint, not a customer UI integration. Unknown/blocked signals do not modify customer inventory or its freshness. There is no new cron, discovery, enrichment, customer event or Discord send.

## Cost and delivery

At 14 products every five minutes around the clock, at most 4,032 routine observations/day (manual checks add more). Each accepted observation uses indexed published-target and receipt lookups plus an insert; there are no full catalog scans. A status request performs 14 indexed latest-record lookups. Storage grows with receipts; no automatic retention deletion is included in this release. Establish retention from measured growth before scaling further.

The extension sends only normalized facts, never DOM, cookies or delivery addresses. A successful response must acknowledge the exact observation ID. Failures remain visible locally; subsequent scheduled checks provide fresh observations, without retrying old facts. Browser notifications are local, deduplicated independently from Catch customer alerts.

## Activation proposal requiring explicit production approval

1. Confirm production migration history and current Worker version; verify the 14 targets remain published. Apply only migration `0046_amazon_browser_observations.sql` as a separate operation. It adds one table and one composite index; no existing inventory or baseline changes.
2. Build and deploy the reviewed Worker with `--keep-vars`, preserving cron, cost-containment and search/browser budgets. Do not use the combined npm deployment script.
3. Provision a dedicated Amazon collector secret, distinct from Catch/Walmart/Mercado Libre/operator credentials. Store it only in the installed extension's background configuration; never commit or print it.
4. Reload Edge extension 0.3.0 and verify one genuine observation receives a matching intake receipt, appears in authenticated status, and leaves customer inventory/events unchanged. No synthetic production stock or Discord message is required.

Rollback: clear the installed collector credential to return to local-only operation and remove the server token to disable intake. If rolling back the Worker, preserve the additive table. Existing data is never reset.

The schema-alignment test's old expectation that production revalidation is enabled was corrected to reflect the already-deployed September 19 pause. Production configuration itself is unchanged.

If customer distribution is later requested, add a separately reviewed advisory event with the same unverified wording and its own freshness/deduplication rules. Do not route this signal through Catch's current BUYABLE NOW event.
