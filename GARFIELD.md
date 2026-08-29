# Project Garfield contract

Catch Em All and Project Spawn are separate repositories and deployment units. GitHub is canonical for both. This file defines their shared boundary; it must remain materially identical in both repositories.

## Ownership

### Catch Em All

- Owns deterministic retailer polling, product observations, availability state, fast lanes, circuit breakers, and immediate Discord delivery.
- Owns retailer-specific request pacing and protection against blocking.
- Must preserve the last good product state when an observation is `ERROR`, `BLOCKED`, or `UNKNOWN`.
- Production is Catch Em All `main`; pending work belongs on `dev` and requires explicit approval before deployment or merge.

### Project Spawn

- Owns broader discovery, retailer-coverage policy, canonical product identity, curated pricing references, review workflows, orchestration, inventory presentation, and future subscriber/product management.
- May accept observations from Catch Em All but must not turn unreviewed observations into curated pricing references.
- Owns the receiving interface and durable review state for benchmark candidates.

## Interfaces

### Benchmark candidate handoff

- Direction: Catch Em All to Spawn only.
- Endpoint: Spawn's non-secret `SPAWN_BENCHMARK_ENDPOINT` configuration.
- Authentication: HMAC-SHA256 using the independently configured encrypted secret `CATCH_INGEST_SECRET`.
- Replay protection: signed Unix timestamp with a five-minute acceptance window.
- Idempotency: Catch-generated stable `event_id`.
- Delivery: short timeout, bounded retry, and fail open. Spawn failure must never interrupt monitoring, product state, or Discord alerts.
- Data classification: observations are evidence. They enter Spawn as `pending` and cannot overwrite curated product or price-reference records automatically.

### Shared vendor and discovery state

- Spawn D1 is authoritative for reversible `ACTIVE` / `SUPPRESSED` vendor status and its audit history.
- Catch reads the authenticated vendor snapshot and reusable monitoring-candidate feed with `CATCH_INGEST_SECRET`, caching the last successful result for five minutes.
- A suppressed vendor is skipped before retrieval, state mutation, or alert delivery. Shared-state fetch failures use the last cached snapshot and never overwrite product state.
- Spawn candidates are English-only, deduplicated by canonical listing identity, retain source URL/family/series/price, and currently route Delta Reign and Ascended Heroes through the same ingestion contract.

### Product identity

- Catch product IDs are source identifiers, not Spawn's canonical product identity.
- Spawn maps source identifiers, ASINs, SKUs, language, region, product format, and variant to a canonical product/variant record during review.
- Either repository may add fields compatibly. Removing or changing required fields requires a coordinated, versioned contract update.

### Alert routing

- Catch owns alert destinations.
- General Pokémon products use `DISCORD_WEBHOOK_URL`; 30th Anniversary products use the explicit `pokemon-30th` routing key resolved by Catch.
- Products explicitly classified with `series: "delta-reign"` use only `DELTA_REIGN_DIRECT`; a missing dedicated webhook is an error and must not fall back to the existing channel.
- Independently verified Delta Reign and 30th Anniversary Amazon identities may enter an hourly `STAGED_SILENT` lane before operator publication. Customer delivery is prohibited until approval.
- Spawn does not proxy or reroute Catch's immediate retailer alerts.

## Change discipline

- Never copy secrets, tokens, cookies, webhook values, or private credentials between repositories or into Git.
- Interface changes update this contract in both repositories in the same coordinated work item.
- Each repository tests and deploys independently. A change in one repository does not authorize deployment or merge in the other.
- Deployment evidence should record the Git commit and provider deployment/version identifier when available.
