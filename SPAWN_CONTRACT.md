# Project Spawn contract

Status: approved operating contract
Date: 2026-08-30
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
- A read-only customer inventory of operator-approved listings with explicit freshness and evidence limitations.
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
- Repeated Amazon ASIN polling as a substitute for Catch Em All. A once-daily customer-inventory refresh must not compete with or impersonate Catch's Amazon hunt.
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
| Customer inventory presentation | Retain and formalize as read-only, approval-gated, and freshness-qualified | Spawn |
| Low-frequency remembered-listing revalidation | Add after isolated validation; target once per 24 hours | Spawn for non-Amazon inventory; Catch remains Amazon hunt owner |
| Thirty-day sold-out archive review | Add; archive rather than delete | Spawn operator workflow |
| Customer inventory-change delivery | Add only through a versioned, idempotent interface | Spawn emits approved event; Catch deduplicates and delivers |
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
