# Project Spawn state

Last reviewed: 2026-08-26

## Canonical state

- Production branch: `main`
- Audited Git commit: `6a30a9d52453e44d3b52d4e52b063d89144c4988`
- Configuration version: `7.0`
- Production hostname: `https://spawn.aztlan-eng.com`
- Live evidence at review: `/healthz` returned healthy and the protected inventory board returned HTTP 200.
- Cloudflare deployment ID: `2afbfe4f-fa5b-42dc-aee7-bd107fd26afb`
- Exact Cloudflare deployment ID / Git commit mapping: not publicly exposed and not confirmed
- Repository visibility at review: public
- Branch protection at review: `main` unprotected, with no required status checks

## Architecture

- Hourly Cloudflare cron at five minutes past the hour
- OpenAI Responses API with web search for broader discovery
- D1 for scan history, inventory, observations, product catalog, security state, feedback, and benchmark candidates
- Discord for minimal subscriber-facing scan and change reports
- Protected inventory board and CSV export
- HMAC-authenticated Catch Em All benchmark-candidate intake
- Global scan lock, manual cooldown, and edge rate limits

## Garfield ownership

Spawn owns discovery policy, retailer coverage, canonical product identity, curated Amazon/Collectr references, review workflows, presentation, and future subscriber/product management. Catch Em All remains a separate deterministic monitor and immediate-alert system. See `GARFIELD.md`.

## Current integration state

- `POST /internal/benchmark-candidates` accepts tightly scoped Amazon México observations from Catch Em All.
- Candidates are idempotent by `event_id` and enter `pending` review state.
- Candidate intake cannot overwrite curated `products` rows.
- Catch delivery is designed to fail open so Spawn outages do not interrupt monitoring or alerts.
- The encrypted `CATCH_INGEST_SECRET` is synchronized between the production Spawn and Catch Em All Workers.
- Fourteen reviewed product identities are seeded for major English sealed formats; deterministic matching currently links 13 live offers without crossing language variants.
- Spawn owns the canonical Amazon watchlist through `amazon_watchlist` and the authenticated `/internal/garfield/amazon-watchlist` endpoint.
- Amazon URLs discovered by Spawn are normalized to ASIN identities and added to the active normal monitoring lane; Catch consumes this list dynamically.

## Pricing-reference state

- The current `products` table stores Amazon launch values, confidence, Collectr USD values, and an exchange rate.
- The board displays retailer price differences against Amazon launch and converted Collectr references, including strong-value, fair-market, above-market, suspicious-price, and placeholder classifications. Above-market availability remains eligible for restock monitoring.
- KantoCards Delta Reign preorder placeholders are modeled separately from sold-out inventory and their nominal `$1.00` price is not benchmark input. KantoCards remains evaluation-only pending a reliability decision.
- The private Garfield operations dashboard is `/dashboard?access=<BOARD_ACCESS_TOKEN>` and fetches Catch health only when the page is requested.
- Weekly Discord feedback is distributed idempotently on Friday morning in `America/Mexico_City` and stored by ISO week without requesting names or email addresses.
- `PRICING_CATALOG.md` defines the normalized target model and review/promotion rules.
- A future additive migration is required for canonical variants, immutable reference history, explicit condition/region fields, exchange-rate provenance, and review audit records. No migration is included in the contract-design change.

## Known discrepancies and risks

- README setup text says the repository should be private, but it is public.
- README describes a reviewed release workflow, but `main` is unprotected.
- Public version evidence proves config `5.2` parity, not exact deployed-commit parity.
- The `deploy` script applies remote D1 migrations and deploys code in one command; operational review should decide whether to separate these steps.
- Shared-token board access is suitable only for private review, not paid/member authorization.

## Update rule

Update this file with changes to architecture, schedules, interfaces, configuration version, repository/deployment evidence, access model, or pricing-reference lifecycle.

## Pending V8 contract implementation

- Review branch only; not deployed or migrated in production.
- Adds migration `0012_published_amazon_catalog.sql` with `DISCOVERED`, `VERIFIED`, `APPROVED`, `PUBLISHED`, `REJECTED`, and `SUSPENDED` lifecycle states.
- Seeds the approved 19-ASIN manifest: 3 priority and 16 normal.
- New Amazon discoveries remain `DISCOVERED` and cannot activate Catch automatically.
- The authenticated watchlist endpoint becomes schema- and catalog-versioned and returns only `PUBLISHED` rows.
- Spawn customer alerts and weekly survey distribution are removed from the scheduled discovery path.
- Scheduled discovery is gated to one Mexico City window every three hours when cron is later re-enabled.
- Configuration version: `8.0.0-rc.1`.
