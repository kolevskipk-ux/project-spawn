# Project Garfield contract

Catch Em All and Project Spawn are separate repositories and deployment units. GitHub is canonical for both. This file defines their shared boundary; it must remain materially identical in both repositories.

## Current activation and status

Reviewed October 19, 2026. See [GARFIELD_FUNCTIONALITY.md](GARFIELD_FUNCTIONALITY.md)
for deployment evidence, activation, scope, expiry and proposals. Keep both files
identical in the Spawn and Catch repositories. Contracts describe permitted
capability; code presence or a true flag alone does not prove active acquisition.

Scout is the separately deployed browser collector for sixteen Amazon ASINs and
approved Walmart/Mercado Libre identities. Spawn validates and stores its receipts;
Catch retains eligible customer delivery. Catch remains in stores-only mode;
its reliable-store pilot expired October 15 at 01:53:47.969 UTC. Legacy Amazon and
marketplace acquisition and paid browser fallback remain paused/disabled. Spawn
market discovery remains active while broad store maintenance is paused.

## Ownership

### Catch Em All

- Owns deterministic retailer polling, product observations, availability state, fast lanes, circuit breakers, and immediate Discord delivery.
- Owns retailer-specific request pacing and protection against blocking.
- Must preserve the last good product state when an observation is `ERROR`, `BLOCKED`, or `UNKNOWN`.
- Production source is Catch Em All `main`; reviewed changes use `codex/` branches and require the applicable merge/deployment authorization.

### Scout

- Owns scoped browser page acquisition on the authorized server, not discovery,
  identity approval, customer publication or customer alert routing.
- Reads serially under bounded pacing; retains manual pauses and true challenge
  backoff. Ordinary shopping continuation is allowed only through the guarded
  one-click flow, never CAPTCHA or account-verification automation.
- Product page access, offer verification and authoritative stock are separate.
- Published or staged Spawn rows do not automatically enroll its fixed allowlist.

### Project Spawn

- Owns broader discovery, retailer-coverage policy, canonical product identity, curated pricing references, review workflows, orchestration, and approval-gated customer inventory presentation.
- May perform bounded low-frequency revalidation of remembered canonical non-Amazon product URLs, initially targeting one attempt per 24 hours. This is inventory maintenance, not a substitute for Scout's current Amazon acquisition and Catch's eligible alert delivery.
- Preserves last-known-good inventory presentation when a revalidation returns `ERROR`, `BLOCKED`, or `UNKNOWN`, and archives continuously sold-out listings only through an audited operator review.
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
- Spawn candidates preserve explicit language, canonical listing identity and source evidence. English is not a general ingestion gate; unknown language remains explicit, and price references never cross unreviewed language variants.

### Product identity

- Catch product IDs are source identifiers, not Spawn's canonical product identity.
- Spawn maps source identifiers, ASINs, SKUs, language, region, product format, and variant to a canonical product/variant record during review.
- Either repository may add fields compatibly. Removing or changing required fields requires a coordinated, versioned contract update.

### Alert routing

- Catch owns alert destinations.
- General Pokémon products use `DISCORD_WEBHOOK_URL`; 30th Anniversary products use the explicit `pokemon-30th` routing key resolved by Catch.
- Products explicitly classified with `series: "delta-reign"` use only `DELTA_REIGN_DIRECT`; a missing dedicated webhook is an error and must not fall back to the existing channel.
- The deployed legacy feed permits independently verified Delta Reign and 30th Anniversary identities in an hourly `STAGED_SILENT` lane, without customer delivery before approval. Catch stores-only mode currently pauses that acquisition. Automatic quiet staged-ASIN enrollment in Scout is proposed, not implemented or enabled.
- Spawn does not proxy or reroute Catch's immediate retailer alerts.

### Customer inventory revalidation

- Spawn uses OpenAI-assisted web search for market discovery and canvassing, not as the primary refresh mechanism for every remembered listing.
- Customer page views read D1 only and never trigger retailer acquisition.
- Spawn distributes due revalidation work in bounded batches with per-domain pacing and conservative parsing.
- A failed, blocked, unknown, challenged, or ambiguous observation never becomes sold out and never overwrites last-known-good price or availability.
- The initial customer freshness deadline is 36 hours. Expired availability evidence is visibly stale and excluded from confirmed-available totals.
- Thirty continuous days of successfully confirmed sold-out evidence creates one operator removal review; it does not automatically delete the listing.
- Approved operator outcomes are `KEEP_TRACKING`, `SNOOZE_30_DAYS`, and `ARCHIVE`. Archive retains durable identity and observation history.
- Spawn may emit a versioned, idempotent event for an approved customer-visible publication or meaningful inventory change. Catch owns Discord routing, deduplication, and delivery; delivery does not by itself authorize acquisition. Catch may fetch explicitly enrolled reliable-store targets within an approved pilot; Spawn retains enrollment, receipt and customer publication state.
- Activation requires coordinated schemas and tests in both repositories and separate approval for migration, Worker deployment, cron activation, and customer delivery.

## Change discipline

- Never copy secrets, tokens, cookies, webhook values, or private credentials between repositories or into Git.
- Interface changes update this contract in both repositories in the same coordinated work item.
- Each repository tests and deploys independently. A change in one repository does not authorize deployment or merge in the other.
- Deployment evidence should record the Git commit and provider deployment/version identifier when available.

## Documentation status discipline

Every functional release updates the map, affected state/runbook and release evidence. Record source, deployment, activation, scope, verification time, limitations, rollback and expiry. Historical records remain dated. Proposed staging, broader discovery, target synchronization or pilot renewal requires its own implementation and activation; this documentation authorizes none of them.
