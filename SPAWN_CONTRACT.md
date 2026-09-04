# Project Spawn contract

Status: approved operating contract with proposed cross-border inventory amendment
Date: 2026-09-03
Applies to: Project Spawn and its interfaces with the rest of Project Garfield

## 1. Mission

Spawn is Garfield's discovery, qualification, and catalog-governance service.

Its job is to find relevant TCG product listings that Garfield does not already know about, preserve the evidence needed to evaluate them, and publish only operator-approved monitoring targets through a stable authenticated interface.

Spawn is not an immediate drop monitor. A Spawn scan may discover an available product, but Garfield must not rely on Spawn's hourly research cycle to catch short-lived inventory.

Spawn describes the observed market, retailer coverage, and discovered listings. It must not describe its results as the complete market size unless a separately defined methodology supports that claim.

The consumer-safe distinction is: Catch is the Amazon fast lane for a curated set of confirmed high-demand SKUs; Spawn provides broader observed-market discovery and context. Neither statement guarantees exhaustive Amazon or whole-market coverage.

## 2. Required outcomes

Every successful Spawn scan must make these questions answerable:

1. Which mandatory discovery sources were attempted?
2. Which sources were accessible, blocked, failed, or inconclusive?
3. Which direct product-detail pages were inspected?
4. What exact product identity, language, price, availability, seller evidence, and source evidence were observed?
5. Which candidates were new or materially changed?
6. Which candidates were rejected, and why?
7. Which product families received inadequate discovery coverage?

A generic `scan completed` result is not sufficient evidence of a successful discovery run.

## 3. Product lifecycle

Spawn owns the following lifecycle:

`DISCOVERED -> VERIFIED -> STAGED_SILENT -> APPROVED -> PUBLISHED`

- `DISCOVERED`: a possible direct listing was found. It is not trusted or monitored.
- `VERIFIED`: exact product identity and current page evidence satisfy the applicable policy.
- `STAGED_SILENT`: a high-confidence Delta Reign or 30th Anniversary Amazon identity is monitored hourly by Catch without customer delivery while awaiting approval.
- `APPROVED`: an operator accepts the identity, retailer, language, and proposed monitoring policy.
- `PUBLISHED`: the candidate is exposed to Catch Em All through the authenticated catalog interface.

Rejection and suspension must be explicit, reversible states with an operator reason and audit timestamp. Discovery alone must never activate monitoring. Only independent verification may activate `STAGED_SILENT`; that state disables customer alerts and routes an early buyable observation only to operations.

### 3.1 Proposed two-Worker verification bridge

Status: proposed for implementation and isolated validation; not active merely because it appears in this contract.

The initial verification capability remains inside Spawn as a separately executed and audited phase. It is a distinct role, not permission for the discovery scan to approve its own output. A third Worker is deferred until measured volume, permissions, scaling, or failure-isolation needs justify extraction.

The verification flow is:

`DISCOVERED -> verification attempt -> VERIFIED or REJECTED -> operator APPROVED -> PUBLISHED -> Catch acknowledgement`

Verification must independently re-fetch or re-observe the direct listing. It must not accept the discovery model's description as proof. Every attempt records:

- Candidate and canonical listing identifiers.
- Verification timestamp, method, HTTP/access outcome, and direct URL.
- Exact product family, set, sealed format, language, region, and retailer SKU/ASIN/UPC evidence.
- Retailer identity and canonical-host validation.
- Observed price, availability wording, seller/fulfillment evidence when attributable, and page evidence reference.
- Duplicate or collision checks against published and pending catalog identities.
- Proposed monitoring eligibility, lane, routing key, and `alert_on_initial_buyable` value.
- Deterministic gate results, confidence, unresolved questions, and a stable rejection or review-needed reason.

Deterministic identity and safety gates are authoritative. AI may summarize evidence or flag ambiguity, but it must not set `APPROVED` or `PUBLISHED`, select a secret destination, or override a failed gate.

`VERIFIED` means the listing identity is sufficiently supported; it does not mean the product is buyable, desirable, or entitled to monitoring. Operator approval separately decides demand relevance, monitoring cost, cadence, routing, and initial-alert policy. Vendor approval and product-target approval are separate decisions: trusting a retailer must not publish every product from that retailer.

Approval must identify the operator, reason, timestamp, accepted evidence revision, and proposed policy. Publication is atomic, increments the catalog version, and exposes only records that pass the published-catalog schema. Catch acknowledgement of the new version is observable in Spawn's operator dashboard.

Spawn's protected Inventory Dashboard is the operator surface for this bridge. It must show queue age, current lifecycle state, the latest independent verification outcome, evidence freshness, duplicate conflicts, proposed Catch policy, decision history, active catalog version, and Catch acknowledgement. Approval and rejection actions require the existing authenticated operator boundary and optimistic concurrency or an equivalent stale-review guard; a decision against an outdated evidence revision must fail closed.

Activation requires:

1. A versioned verification-attempt schema and immutable evidence history.
2. Tests proving discovery cannot approve or publish itself.
3. Tests for identity, URL/host, language, format, duplicate, routing-key, and stale-evidence failures.
4. Protected dashboard review actions with auditable operator identity and reason.
5. Atomic catalog publication with version increment and rollback evidence.
6. Catch acknowledgement and one-time-notice integration passing in isolated Workers/D1.
7. Removal of Spawn's raw customer Discord path and its customer webhook dependency.
8. Separate approval for database migration, Worker deployment, and production activation.

When this bridge is activated, Spawn becomes fully silent on customer Discord routes. Its temporary raw-discovery feed is removed. Spawn may retain operator-only failure or review-backlog notices through an operations route, but Discord delivery must not determine whether discovery evidence is persisted.

### 3.2 Proposed remembered-inventory revalidation

Status: approved for implementation and isolated validation on 2026-08-30; not active until its migration, Worker, cron, and customer-delivery gates are separately approved.

Spawn separates open-ended discovery from maintenance of listings it already remembers:

`OpenAI-assisted discovery -> durable direct listing -> bounded Worker revalidation -> normalized observation -> customer inventory and approved Catch event`

OpenAI-assisted web search remains responsible for market canvassing, new-product discovery, new-retailer discovery, and ambiguous evidence research. It must not be the primary mechanism for keeping every remembered listing fresh. Spawn's Worker may re-fetch a known canonical direct product URL at low frequency without invoking discovery, subject to retailer policy, robots/access controls, per-domain limits, and conservative parsing.

The initial revalidation objective is one successful attempt per active published listing within each 24-hour window. Work must be distributed in bounded batches rather than launched as a daily burst. The initial customer freshness deadline is 36 hours, allowing bounded retry without representing substantially old evidence as current; changing that deadline requires a versioned configuration change and tests. The scheduler records due time, attempt time, access outcome, parser outcome, next eligible time, and per-domain backoff. A customer page view must never trigger retailer acquisition.

The remembered-inventory lifecycle is:

- `ACTIVE`: a recent successful observation supports the displayed state.
- `STALE`: the freshness objective was missed; the last observation is historical rather than current.
- `UNKNOWN`: the page was reached but current availability could not be established.
- `BLOCKED`: robots, challenge, access control, or retailer protection prevented reliable observation.
- `SOLD_OUT`: successful direct evidence confirms unavailable inventory.
- `REMOVAL_REVIEW`: the listing satisfies the continuous sold-out review rule and awaits an operator decision.
- `ARCHIVED`: removed from the live customer inventory by an audited operator decision while history and identity remain durable.

`ERROR`, `BLOCKED`, `UNKNOWN`, timeouts, parser failures, redirects to non-product pages, and missing evidence must never become `SOLD_OUT` and must never overwrite the last-known-good price or availability observation. A listing presented as available becomes visibly stale after a configurable freshness deadline and must be excluded from confirmed-available totals when its confirmation expires. Freshness policy and timestamps must be visible to customers.

A listing becomes eligible for `REMOVAL_REVIEW` only when all of the following are true:

1. A successful observation first confirmed `SOLD_OUT` at least 30 days earlier.
2. At least one later successful sold-out confirmation exists.
3. No successful buyable observation occurred during the interval.
4. A recent successful observation still confirms sold out; access failures do not advance or complete the rule.
5. No unresolved removal review or archive decision already exists.

Spawn sends one deduplicated operator-only removal-review notice. The authenticated decision vocabulary is `KEEP_TRACKING`, `SNOOZE_30_DAYS`, or `ARCHIVE`, with operator identity, reason, accepted evidence revision, and timestamp. `ARCHIVE` never deletes evidence. Rediscovery of an archived identity creates a reopening review or restores it under an explicit policy; it must not create an unrelated duplicate.

Only customer-visible listings approved under the publication workflow may produce customer events. Spawn persists and exposes a stable, idempotent normalized change event; Catch owns customer delivery and delivery deduplication. A discovery observation, failed revalidation, stale transition, blocked transition, or removal-review event must not become a customer purchase alert. The exact event interface, retry policy, and customer-visible transition vocabulary require coordinated schema tests in both repositories before activation.

#### 3.2.1 Observation reuse and Amazon ownership

One trustworthy acquisition result may support several downstream views, but it remains one immutable observation with one source owner. Deriving customer inventory, pricing evidence, freshness, and an eligible change event from that observation must not trigger duplicate retailer requests.

- Catch remains the acquisition and state owner for every Amazon ASIN in its published or staged monitoring catalog. Spawn consumes a versioned, authenticated, bounded customer-safe observation projection for those identities; it does not issue a second daily Amazon fetch.
- The customer-safe projection may seed a missing `PUBLISHED` Amazon identity into inventory as a silent baseline and may refresh its state, lowest verified price, seller, and fulfilment evidence. Baseline seeding creates no `LISTING_PUBLISHED`, availability, pricing, or Discord event. Only trustworthy `BUYABLE`, `PREORDER_BUYABLE`, or `SOLD_OUT` observations may replace displayed availability; `UNKNOWN`, `BLOCKED`, and `ERROR` are retained as audit evidence without overwriting last-known-good state. Replays are idempotent and older evidence cannot overwrite a newer observation.
- A main-page `SOLD_OUT` or no-featured-offer result does not override a newer verified Buying Options offer. When Catch supplies Buying Options evidence, Spawn displays the lowest attributable offer as available and retains its seller context.
- Spawn may revalidate customer-visible Amazon listings that are not monitored by Catch, but only in the low-frequency revalidation scheduler, with a distinct request budget and Amazon access/backoff telemetry. This is inventory maintenance, never a fast lane.
- A Codex seed record, OpenAI discovery response, search result, model statement, or catalog publication is evidence of identity only. None satisfies revalidation freshness or proves current availability.
- Benchmark promotion remains review-gated even when the same trustworthy observation supports customer inventory. Reuse does not convert evidence into a curated price reference.
- Observation identity, source owner, acquisition timestamp, parser/classifier version, and evidence revision must remain traceable through every derived record and event.

#### 3.2.2 Customer inventory event interface

The normalized customer-event vocabulary is initially closed to `LISTING_PUBLISHED`, `BECAME_BUYABLE`, and `PRICE_DROP`. `LISTING_PUBLISHED` announces an operator-approved customer-visible listing and does not claim availability. `BECAME_BUYABLE` requires a trustworthy transition from a non-buyable last-known-good state. `PRICE_DROP` requires trustworthy current and prior prices plus the configured materiality threshold.

`SOLD_OUT`, `STALE`, `UNKNOWN`, `BLOCKED`, `ERROR`, removal-review, archive, discovery, verification, and benchmark-review changes update operational or inventory state only and never become customer purchase alerts.

Each event contains a stable event ID, schema version, event type, canonical product and listing IDs, retailer, direct URL, observed state, verified price and seller fields when attributable, source observation ID, occurred-at timestamp, routing key, and evidence freshness. Spawn persists events before exposure through an authenticated bounded feed. Replays return the same event ID. Catch records delivery independently and acknowledges terminal delivery outcomes without changing the underlying observation. Retention, cursors, retry limits, and acknowledgement endpoints must be covered by cross-repository schema fixtures before activation.

### 3.3 Proposed availability/enrichment ownership amendment

Status: proposed for review. This section does not authorize implementation, schema migration, deployment, cron change, or production activation.

The coordinated operating boundary is:

`Catch cadence availability observation -> immediate transition alert -> authenticated Spawn handoff -> immediate or daily commercial enrichment -> unified customer inventory`

Catch remains the sole owner of fast Amazon availability acquisition, state transitions, last-known-good hunt state, circuit breakers, and immediate customer restock delivery. Spawn becomes the sole owner of routine price history, seller and fulfilment enrichment, benchmark comparison, MSRP-context inference, and customer-inventory commercial presentation.

This amendment narrowly replaces the prior rule that Spawn never performs a second Amazon fetch. Spawn may fetch an approved Amazon listing for bounded commercial enrichment, but must not reproduce Catch's Hot, Warm, or Standard availability cadence, decide Catch availability state, close a Catch breaker, or deliver an immediate restock alert. The default enrichment objective is at most one scheduled commercial refresh per active listing in each 24-hour window, distributed in bounded batches under a separate Amazon enrichment budget and backoff policy.

When Catch reports a trustworthy `BECAME_BUYABLE` transition, Spawn queues one deduplicated immediate enrichment attempt for that listing. The Catch-to-Spawn message is a versioned availability observation with a stable Catch transition ID and delivery outcome, not a request for Spawn to deliver the same alert. A pending or failed enrichment does not alter the Catch transition. Replayed observations reuse the same queue identity and cannot create duplicate retailer requests. Per-listing cooldown, global concurrency, daily request limits, and Amazon access outcomes must be measurable.

Catch availability observations may omit price, seller, and fulfilment. Spawn accepts such an observation when its identity, authentication, source ownership, transition evidence, timestamp, routing key, and freshness are valid. The inventory record becomes buyable with `price_verification_status = PENDING`. Enrichment later records attributable price, seller, fulfilment, observation time, and evidence source without generating a routine second customer alert.

For a Catch-owned Amazon observation, Spawn must not generate or expose a `BECAME_BUYABLE` customer event back to Catch because Catch already owns and attempts that immediate delivery. The Catch transition ID is the cross-system deduplication key. The existing Spawn-to-Catch `BECAME_BUYABLE` event remains applicable to Spawn-owned non-Amazon revalidation, where Spawn detects the transition and Catch is only the delivery owner.

Only a separately eligible commercial event may create a follow-up customer message. Initial examples are a material `PRICE_DROP` under a configured threshold and a future explicitly approved `AMAZON_SOLD_LIKELY_MSRP` signal. Routine enrichment completion, seller text changes, and unchanged prices remain silent.

Amazon evidence precedence is confidence-aware:

1. A newer verified Buying Options or featured-offer observation establishes buyability.
2. A main-page `NO_FEATURED_OFFER` observation cannot invalidate verified alternate-offer evidence.
3. Only a newer authoritative inspection that explicitly finds no eligible purchase options may establish `SOLD_OUT` after buyability.
4. Evidence that misses its freshness deadline becomes visibly stale or revalidation-pending; expiry alone does not assert sold out.
5. `UNKNOWN`, `BLOCKED`, `ERROR`, parser failure, and quota exhaustion preserve the last-known-good observation while degrading freshness.

Cross-repository activation requires a versioned optional-price availability-observation schema, mandatory source ownership and Catch transition identity, loop-prevention fixtures, queue idempotency, bounded enrichment scheduling, independent Amazon enrichment backoff, evidence-precedence fixtures, stale-state behavior, meaningful-commercial-event thresholds, and proof that Spawn enrichment failure cannot delay or duplicate Catch alerts. Migration, Worker deployment, enrichment cron activation, and customer-event activation remain separate approval gates.

### 3.4 Proposed unified customer inventory presentation

Status: proposed for review. This section does not authorize customer-access publication or authentication changes.

Spawn presents one customer inventory across all approved retailers. Amazon and non-Amazon listings must not be separated into different pages, totals, or primary navigation merely because different Workers acquire them. Internal Worker ownership remains visible in operator telemetry, not as the customer's information architecture.

The customer surface is product- and offering-oriented. Each offering exposes at least:

- Canonical product name, set/family, sealed format, language, and region.
- Store or retailer, retailer-specific identifier, and safe direct URL.
- Customer availability status and price-verification status as separate fields.
- Current verified price, seller, and fulfilment only when attributable.
- Last availability observation and last commercial-enrichment timestamps.
- A plain-language freshness label and monitoring class.

The initial customer availability vocabulary is `BUYABLE`, `SOLD_OUT`, `NO_FEATURED_OFFER`, `UNKNOWN`, and `STALE`. The initial price-verification vocabulary is `VERIFIED`, `PENDING`, `STALE`, and `UNAVAILABLE`. Availability and price status must not be collapsed into one field: a listing can be buyable while price verification is pending.

The initial freshness labels are:

- `LIVE_MONITORED`: availability is checked by Catch at a published Hot, Warm, or Standard objective.
- `DAILY_VERIFIED`: the listing is maintained by Spawn's bounded low-frequency revalidation.
- `REVALIDATION_PENDING`: the applicable freshness deadline has passed or enrichment is queued.
- `ACCESS_DEGRADED`: access, parser, quota, or breaker evidence prevents a current claim while last-known-good history is retained.

The unified inventory supports store as a first-class filter alongside status, set, language, and text search. Store badges and freshness labels may distinguish offerings; there is no Amazon-only customer inventory view required by contract. Multiple confidently matched retailer offerings may be grouped beneath one canonical product. Unmatched or ambiguous identities remain separate until operator review rather than being merged heuristically.

Customer totals must be derived consistently from the unified dataset. Confirmed-available totals exclude stale, pending, unknown, blocked, and error-like evidence. CSV/export uses the same filtered records and status semantics as the visible page. A page view never triggers retailer acquisition.

Customer access must be read-only and separated from the authenticated operator dashboard. Approval, publication, rejection, archive, evidence, health, and secret-bearing interfaces must never be reachable merely because a customer can view inventory. Authentication, authorization, tenant/subscriber entitlement, rate limiting, caching, privacy, and export policy require a separate reviewed security and monetization amendment before external access is activated.

Activation requires schema migration and backfill tests, cross-retailer identity fixtures, filter and export parity, freshness and total calculations, responsive/accessibility review, cache behavior, and proof that customer reads cannot invoke acquisition or operator mutations.

### 3.4.1 Proposed cross-border inventory and customer disclosure amendment

Status: proposed for review. This section does not authorize schema migration, retailer activation, customer publication, scheduled acquisition, alert delivery, or production deployment.

Spawn may discover and retain relevant international retailer listings when they provide useful market coverage for Mexico-based customers. A localized path, translated page, MXN display, or `en-mx` storefront selector is presentation evidence only; none independently proves that the retailer is based in Mexico, ships the exact item to Mexico, includes import costs, or sells the required product-language variant.

Every offer receives exactly one fulfilment-region state:

- `DOMESTIC`: trustworthy evidence establishes domestic Mexican fulfilment for the exact offer.
- `CROSS_BORDER_CONFIRMED`: trustworthy current evidence establishes that the exact offer can be delivered to Mexico from outside Mexico.
- `CROSS_BORDER_UNVERIFIED`: the retailer or shipment appears international and Mexico delivery, origin, or checkout eligibility is unresolved.
- `DESTINATION_UNAVAILABLE`: trustworthy current evidence establishes that the exact offer cannot be delivered to Mexico.

Discovery may store all four states for research and deduplication. Only `DOMESTIC` and `CROSS_BORDER_CONFIRMED` are eligible for routine customer publication. `CROSS_BORDER_UNVERIFIED` remains in operator review or research inventory, and `DESTINATION_UNAVAILABLE` is not customer-buyable. An operator cannot convert localized currency or page language into delivery confirmation without separate evidence.

Cross-border verification is evidence-bound and records, when attributable:

- Retailer legal or operating country and evidence source.
- Ship-from country for the exact offer, which may differ from retailer country.
- Whether the exact product and selected variant can be delivered to a Mexico destination.
- Product language and region, independently of storefront language.
- Displayed item price, original currency, conversion currency and rate when conversion is performed.
- Shipping charge and whether it is known before checkout.
- Import-duty and tax treatment as `INCLUDED`, `EXCLUDED`, or `UNKNOWN`.
- Destination-check timestamp, evidence freshness deadline, acquisition method, and parser or reviewer identity.

The displayed item price is never represented as a landed price when shipping, duties, taxes, brokerage, or currency conversion remain unknown. The first release must not estimate landed cost. Price comparisons involving incomplete cross-border costs are labelled `DISPLAYED_PRICE_ONLY` and cannot support `best price`, `below MSRP`, `likely MSRP`, or equivalent total-cost claims.

The unified customer inventory applies the fulfilment distinction throughout the experience:

- Each offering displays a `Domestic`, `International`, or `Region unverified` badge.
- Domestic offers sort before cross-border offers by default. Cross-border offers with unknown landed cost do not outrank a domestic offer merely because their displayed item price is lower.
- Filters include `Ships from Mexico`, `International`, and `Shipping unverified`, in addition to the existing store filter.
- Availability distinguishes `BUYABLE` with Mexico delivery confirmed from retailer-site buyability whose destination is unresolved.
- The product link is accompanied by a checkout-proximate disclosure equivalent to: **International seller. Shipping, import duties, taxes, currency conversion, and delivery times may be added or changed at checkout.**
- Customer alerts for confirmed cross-border offers begin with an unmistakable `INTERNATIONAL OFFER` label and include original currency, seller or retailer country, Mexico-delivery status, known shipping cost, import-cost status, evidence time, direct URL, and the same disclosure.
- Product grouping may place domestic and international offerings under one confidently matched canonical product, but each retailer offer retains its own availability, price, fulfilment-region, and freshness evidence.
- CSV/export includes fulfilment-region state, retailer country, ship-from country, original currency, Mexico-delivery status, shipping amount, import-cost status, and evidence timestamps using the same filtered dataset as the page.

Customer preferences may later allow cross-border alerts to be disabled, but the event contract must carry the fulfilment-region fields from its first activated version so a subscriber-facing preference can be added without reclassifying historic evidence.

Spawn owns discovery, retailer review, destination verification, low-frequency monitoring, stale-state handling, and event creation for international non-Amazon listings. The initial monitoring objective is no more frequent than once per 24 hours unless a retailer-specific contract is separately approved. `UNKNOWN`, `BLOCKED`, checkout ambiguity, geolocation variance, and expired destination evidence preserve the last-known-good record while degrading it to unverified or stale; they never assert domestic fulfilment or Mexico deliverability.

Activation requires fixtures for localized-but-US storefronts, original and converted currency, unknown shipping, included and excluded duties, destination denial, product-language independence, stale destination evidence, grouping, default sort order, filters, CSV parity, disclosure placement, event replay, and proof that a page view cannot initiate checkout or retailer acquisition. Secure customer access remains governed by its separate future security and monetization gate.

### 3.5 Approved bulk seed-campaign intake

Status: intake and bounded production verification activated after isolated validation on 2026-09-03. Verification is limited to two `DISCOVERED` ASINs per invocation and grants no publication or Catch authority.

The one-off Amazon México Pokémon TCG canvass may be performed directly by Codex rather than consuming the recurring OpenAI discovery budget. Results enter Spawn through a protected bulk evidence boundary:

`Codex canvass -> authenticated seed batch -> durable DISCOVERED evidence -> independent verification -> customer-visibility and Catch decisions`

The operator endpoint uses the existing `RUN_TOKEN` bearer boundary, accepts JSON only, and is rate- and size-limited. The initial limits are at most 100 candidates per request and 1,000 candidates per campaign. A campaign supplies a schema version, stable campaign ID, stable batch ID, submission timestamp, declared source, and items. Each item supplies a stable source ID, canonical direct URL, retailer, retailer identifier such as ASIN/SKU/UPC, observed title, proposed family/set/format/language/region, observed price and seller/fulfilment evidence when present, observation timestamp, and bounded provenance or evidence text.

The receiver must validate HTTPS and canonical host policy, direct-product URL shape, identifier syntax, campaign and batch identity, timestamps, payload bounds, and duplicate retailer identity before persistence. It returns a deterministic per-item disposition of `ACCEPTED`, `DUPLICATE`, or `REJECTED` with a stable reason. Campaign, batch, payload hash, actor, counts, and receipt time are audited without retaining credentials.

Bulk intake grants no approval authority. Accepted records begin as `DISCOVERED`, cannot publish themselves, cannot enter `STAGED_SILENT`, cannot change current inventory, cannot create a customer event, and cannot overwrite curated pricing references. Existing identities receive new evidence revisions rather than unrelated duplicates. Partial item rejection must not discard valid items, and safe replay of the same batch must not create additional records.

Production verification may promote a direct Amazon México page with a matching ASIN and non-blocked HTTP evidence into the operator review queue even when language or canonical catalog identity remains unresolved. Those unresolved fields must be decided by an administrator. Robot blocks, transport failures, non-product redirects, and ASIN mismatches fail closed and do not become review eligible. Verification itself cannot publish the listing, emit a customer event, or enroll it in Catch.

Recurring OpenAI-assisted discovery remains limited to its contracted windows. The seed campaign neither changes that schedule nor authorizes a daily intensive canvass. After an accepted listing is independently verified and approved for customer visibility, deterministic Worker revalidation—not repeated model search—maintains it at the applicable low-frequency objective. Only separately approved high-demand Amazon identities may be published to Catch monitoring.

## 4. Spawn responsibilities

Spawn owns:

- Broad public-web and retailer discovery.
- Mandatory-source coverage policy and reporting.
- Exact canonical product identity across retailer SKUs, ASINs, UPCs, languages, regions, sets, and sealed formats.
- Conservative listing qualification and evidence retention.
- Retailer identity, review status, and reversible suppression policy.
- Review queues for discovered products, retailers, and benchmark observations.
- Curated MSRP, launch-price, and secondary-market references, including provenance and confidence.
- Durable discovery history, rejected candidates, source failures, and scan diagnostics in D1.
- The authenticated, versioned catalog/watchlist interface consumed by Catch Em All.
- Operator-facing discovery and catalog views.
- One unified read-only customer inventory of operator-approved Amazon and non-Amazon offerings with explicit availability, price-verification, and freshness dimensions.
- Low-frequency, bounded revalidation of remembered canonical non-Amazon listing URLs under the proposed revalidation contract.
- Durable revalidation history, last-known-good protection, stale classification, and audited archive review.
- Recurring Amazon México discovery for new relevant TCG ASINs, formats, preorders, and material price or availability signals.

Amazon discovery must run at least once within every configured multi-hour discovery window when Spawn is scheduled. The initial target is once every three hours, subject to measured cost and access reliability. Each window must record attempted queries or surfaces, coverage outcome, candidate count, and access limitations. A successful run must not imply that every Amazon listing was enumerated.

Amazon discoveries enter `DISCOVERED`; they do not enter Catch automatically. An operator must confirm the exact ASIN, product identity, sealed format, language, demand rationale, and monitoring lane before the record becomes `PUBLISHED`.

Initial Catch eligibility is intentionally narrow: high-demand sealed TCG products where short-lived Amazon inventory warrants fast monitoring. Examples include major preorders and releases such as Pokémon 30th Celebration, Delta Reign, Ascended Heroes, and Prismatic Evolutions. Spawn may discover broader products for market visibility without publishing them to Catch.

## 5. Spawn non-responsibilities

Spawn must not own:

- One-minute, five-minute, or other fast deterministic availability polling.
- Immediate restock or preorder alerts.
- Amazon availability circuit breakers.
- Last-known-good state for Catch-owned Amazon hunting. Spawn does own conservative last-known-good presentation for its low-frequency customer inventory.
- Customer-facing per-product Discord routing.
- Repeated fast Amazon ASIN polling as a substitute for Catch Em All. Bounded daily or transition-triggered commercial enrichment is allowed only under section 3.3 and must not compete with or impersonate Catch's hunt.
- Automatic promotion of discoveries into active monitoring.
- Automatic replacement of curated pricing references with unreviewed observations.
- Subscriber surveys or unrelated engagement features in the critical discovery execution path.

Spawn may retain an operator-only notification that a discovery run failed or that a candidate awaits review. It should not publish subscriber-facing purchase alerts.

## 6. Catch Em All handoff

Catch Em All should pick up these responsibilities removed from Spawn:

- Poll every `PUBLISHED` target at its approved cadence.
- Apply retailer-specific acquisition and classification logic.
- Maintain last-known-good availability state.
- Own normal-lane and priority-lane circuit breakers.
- Detect meaningful availability transitions.
- Route immediate alerts to the approved destination.
- Report monitor freshness, catalog version, lane membership, breaker state, and delivery outcome.
- Deliver deduplicated customer-visible publication or approved inventory-change events emitted through the coordinated Spawn interface.
- Emit authenticated Amazon availability-observation handoffs that may omit price and cannot be echoed as duplicate customer events.

Catch Em All should not pick up:

- Open-ended web discovery.
- Product identity inference from ambiguous search results.
- MSRP research or secondary-market valuation.
- Automatic trust decisions for new retailers.
- Review workflows, subscriber management, surveys, or catalog editing.

## 7. Published catalog contract

Every published target must include, at minimum:

- Stable canonical product ID.
- Product family, set, exact format, language, and region.
- Retailer and retailer-specific identifier such as ASIN, UPC, or SKU.
- Canonical direct product URL.
- Monitoring lane and requested cadence.
- Alert-routing key, never a webhook value.
- Explicit `alert_on_initial_buyable` policy.
- Approval status, approver or mechanism, reason, and timestamp.
- Discovery source and supporting evidence reference.
- Catalog version and record update timestamp.

Catch must fail closed on unknown routing keys and invalid records. It must retain its last successfully validated catalog if Spawn is unavailable or publishes an invalid response.

The initial publishable routing-key vocabulary is `pokemon-main`, `pokemon-30th`, `delta-reign`, and `magic-hobbit`. `operations` is reserved inside Catch and must never be published on a product record. Spawn does not know or publish the corresponding Worker binding names.

## 8. Discord ownership

- Spawn: operator-only scan failures and review-needed notices.
- Catch: immediate retailer availability alerts and their delivery status.
- The former temporary raw-discovery exception is retired by the verification bridge. Spawn has no customer Discord delivery path.
- Catch owns the only customer-visible Discord handoff by announcing a record after it is `PUBLISHED` and consumed into its approved visibility or monitoring disposition.
- Under the proposed revalidation contract, Catch also owns delivery of approved customer inventory-change events. Visibility-only non-Amazon delivery does not make Catch the monitor or source of the observation.
- Neither Worker stores webhook values in source control or catalog records.
- Alert destinations are referenced by stable routing keys and resolved from Worker secrets.

## 9. Failure classification

Every missed drop must be assigned one primary cause:

- Product not discovered.
- Candidate not verified.
- Candidate awaiting or denied approval.
- Published catalog not consumed.
- Scheduled poll did not execute.
- Retailer access blocked or transport failed.
- Page incorrectly classified.
- Circuit breaker open.
- State transition incorrectly suppressed.
- Alert routing or delivery failed.
- Alert arrived after inventory expired.

The review must identify the owning component and a test, metric, or operational control that prevents recurrence.

## 10. Release and restart gates

Spawn may resume scheduled production scans only after:

1. Production is mapped to an exact `main` commit.
2. The database schema and applied migrations are inventoried.
3. Required secret names are verified without exposing values.
4. The discovery contract and current watch policy are represented by tests.
5. One authenticated manual scan completes with subscriber-facing alerts disabled.
6. Its source-coverage report and candidate classifications pass operator review.
7. The published catalog validates against its schema and version.
8. Cron activation is performed as a separate, explicit production operation.

Database migration, Worker deployment, and cron activation must be separate steps.

## 11. Possible third Worker: Amazon acquisition service

A third Worker is not part of the initial baseline. Catch Em All remains the owner of immediate Amazon monitoring.

An Amazon-specific acquisition service should be introduced only if evidence shows that Amazon access requires materially different infrastructure or scaling. Appropriate triggers include:

- Browser rendering must be isolated from lightweight retailer polling.
- Amazon request volume, concurrency, or backoff policy cannot be safely shared with other retailers.
- Independent deployment or failure containment measurably improves availability.
- Multiple consumers require the same normalized Amazon observation feed.

If introduced, this service must be an acquisition component, not another decision-maker:

`Published catalog -> Amazon acquisition -> normalized observation -> Catch state machine -> Catch alert`

It may fetch pages, inspect Buying Options, apply Amazon-specific access controls, and return normalized evidence. It must not own canonical product approval, last-known-good state, Discord routing, or alert decisions. Catch remains accountable for cadence, transitions, and delivery.

Do not create this Worker merely to work around unclear ownership or stale branches. Establish metrics from the simplified two-Worker baseline first.

## 12. Pivotal-review disposition

| Current Spawn capability | Disposition | New owner or boundary |
| --- | --- | --- |
| OpenAI-assisted web discovery | Retain | Spawn |
| Mandatory retailer canvassing | Retain and instrument | Spawn |
| Amazon México new-ASIN discovery | Retain; run at least once per three-hour window initially | Spawn discovers; operator approves; Catch monitors |
| Canonical product and retailer records | Retain | Spawn |
| Discovery evidence and review queues | Retain | Spawn |
| Published Amazon watchlist | Retain as a reviewed interface | Spawn publishes; Catch consumes |
| Hourly scan history and diagnostics | Retain | Spawn |
| Curated benchmark intake | Retain, review-gated | Spawn |
| Immediate available-product Discord alerts | Remove | Catch |
| Known-ASIN availability polling | Remove from discovery loop | Catch |
| Amazon hunt availability transitions | Remove from Spawn | Catch |
| Low-frequency non-Amazon inventory state | Add after isolated validation | Spawn; never represented as Catch-speed monitoring |
| Amazon circuit breakers | Do not add | Catch |
| Per-product alert-channel routing | Remove | Catch |
| Customer inventory presentation | Retain as one unified, read-only, approval-gated cross-retailer inventory with store filtering and separate freshness dimensions | Spawn |
| Low-frequency remembered-listing revalidation | Add after isolated validation; target once per 24 hours | Spawn for non-Amazon inventory; Catch remains Amazon hunt owner |
| Thirty-day sold-out archive review | Add; archive rather than delete | Spawn operator workflow |
| Customer inventory-change delivery | Add only through a versioned, idempotent interface | Spawn emits approved event; Catch deduplicates and delivers |
| Amazon price/seller enrichment | Add as bounded daily and transition-triggered work after coordinated activation | Spawn; Catch remains fast availability owner |
| Weekly subscriber survey | Decouple from core path; reassess separately | Neither core Worker by default |
| Combined Catch/Spawn operations dashboard | Retain only if read-only and operator-focused | Spawn may present; ownership remains separate |

## 13. Success measures

Spawn is healthy when:

- Mandatory-source coverage is measurable and current.
- Candidate identity and evidence quality meet policy.
- Review latency is visible.
- Published targets are versioned, valid, and acknowledged by Catch.
- Verification attempts, queue age, rejection reasons, operator decisions, catalog publication, and Catch acknowledgement are independently auditable.
- Discovery failures cannot interrupt Catch monitoring.
- Amazon discovery-window coverage and limitations are visible without claiming exhaustive market coverage.
- Published customer inventory exposes observation freshness and never counts expired evidence as confirmed available.
- Due revalidation backlog, per-domain access failures, parser uncertainty, sold-out duration, and archive-review age are measurable.
- Archived listings retain identity and history and can be deliberately reopened when rediscovered.

Spawn is not evaluated by whether its hourly run catches a short-lived drop. That is an immediate-monitoring outcome owned by Catch Em All.

## 14. Repository-change authority

Codex is the sole routine operator authorized to create branches, edit repository files, commit changes, push branches, merge changes, or initiate GitHub-backed deployments for Project Garfield.

Other ChatGPT personas may discuss requirements, analyze evidence, and recommend work. If they cannot complete a task without changing GitHub or production, they must stop and direct the operator back to Codex. They must not improvise repository changes, merges, deployments, migrations, secret changes, or baseline resets.

The only exception is a confirmed, system-wide production outage where all Garfield production monitoring is unavailable and waiting for Codex would materially prolong the outage. Emergency action must be limited to the smallest reversible recovery step. It must not introduce features, migrations, catalog changes, or baseline resets. The operator must preserve evidence and return to Codex afterward for reconciliation, testing, and repository documentation.

This policy is an operating agreement, not a technical access control. GitHub permissions and branch protection should be configured separately so `main` requires review and cannot be changed through an unreviewed direct push.
