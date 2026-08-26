# Project Spawn state

Last reviewed: 2026-08-25

## Canonical state

- Production branch: `main`
- Audited Git commit: `6a30a9d52453e44d3b52d4e52b063d89144c4988`
- Configuration version: `5.2`
- Production hostname: `https://spawn.aztlan-eng.com`
- Live evidence at review: `/healthz` and `/readyz` returned healthy; `/version` returned `5.2`
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

## Pricing-reference state

- The current `products` table stores Amazon launch values, confidence, Collectr USD values, and an exchange rate.
- The board displays retailer price differences against Amazon launch and converted Collectr references.
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
