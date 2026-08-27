# Project Spawn contract

Status: approved operating contract  
Date: 2026-08-27  
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

`DISCOVERED -> VERIFIED -> APPROVED -> PUBLISHED`

- `DISCOVERED`: a possible direct listing was found. It is not trusted or monitored.
- `VERIFIED`: exact product identity and current page evidence satisfy the applicable policy.
- `APPROVED`: an operator accepts the identity, retailer, language, and proposed monitoring policy.
- `PUBLISHED`: the candidate is exposed to Catch Em All through the authenticated catalog interface.

Rejection and suspension must be explicit, reversible states with an operator reason and audit timestamp. Discovery alone must never activate monitoring.

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
- Recurring Amazon México discovery for new relevant TCG ASINs, formats, preorders, and material price or availability signals.

Amazon discovery must run at least once within every configured multi-hour discovery window when Spawn is scheduled. The initial target is once every three hours, subject to measured cost and access reliability. Each window must record attempted queries or surfaces, coverage outcome, candidate count, and access limitations. A successful run must not imply that every Amazon listing was enumerated.

Amazon discoveries enter `DISCOVERED`; they do not enter Catch automatically. An operator must confirm the exact ASIN, product identity, sealed format, language, demand rationale, and monitoring lane before the record becomes `PUBLISHED`.

Initial Catch eligibility is intentionally narrow: high-demand sealed TCG products where short-lived Amazon inventory warrants fast monitoring. Examples include major preorders and releases such as Pokémon 30th Celebration, Delta Reign, Ascended Heroes, and Prismatic Evolutions. Spawn may discover broader products for market visibility without publishing them to Catch.

## 5. Spawn non-responsibilities

Spawn must not own:

- One-minute, five-minute, or other deterministic availability polling.
- Immediate restock or preorder alerts.
- Amazon availability circuit breakers.
- Last-known-good monitoring state.
- Customer-facing per-product Discord routing.
- Repeated polling of known ASINs as a substitute for Catch Em All.
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
- Approval status, approver or mechanism, reason, and timestamp.
- Discovery source and supporting evidence reference.
- Catalog version and record update timestamp.

Catch must fail closed on unknown routing keys and invalid records. It must retain its last successfully validated catalog if Spawn is unavailable or publishes an invalid response.

## 8. Discord ownership

- Spawn: operator-only scan failures and review-needed notices.
- Catch: immediate retailer availability alerts and their delivery status.
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
| Availability state transitions | Remove | Catch |
| Amazon circuit breakers | Do not add | Catch |
| Per-product alert-channel routing | Remove | Catch |
| Inventory presentation | Retain only as an operator catalog/discovery view | Spawn |
| Weekly subscriber survey | Decouple from core path; reassess separately | Neither core Worker by default |
| Combined Catch/Spawn operations dashboard | Retain only if read-only and operator-focused | Spawn may present; ownership remains separate |

## 13. Success measures

Spawn is healthy when:

- Mandatory-source coverage is measurable and current.
- Candidate identity and evidence quality meet policy.
- Review latency is visible.
- Published targets are versioned, valid, and acknowledged by Catch.
- Discovery failures cannot interrupt Catch monitoring.
- Amazon discovery-window coverage and limitations are visible without claiming exhaustive market coverage.

Spawn is not evaluated by whether its hourly run catches a short-lived drop. That is an immediate-monitoring outcome owned by Catch Em All.

## 14. Repository-change authority

Codex is the sole routine operator authorized to create branches, edit repository files, commit changes, push branches, merge changes, or initiate GitHub-backed deployments for Project Garfield.

Other ChatGPT personas may discuss requirements, analyze evidence, and recommend work. If they cannot complete a task without changing GitHub or production, they must stop and direct the operator back to Codex. They must not improvise repository changes, merges, deployments, migrations, secret changes, or baseline resets.

The only exception is a confirmed, system-wide production outage where all Garfield production monitoring is unavailable and waiting for Codex would materially prolong the outage. Emergency action must be limited to the smallest reversible recovery step. It must not introduce features, migrations, catalog changes, or baseline resets. The operator must preserve evidence and return to Codex afterward for reconciliation, testing, and repository documentation.

This policy is an operating agreement, not a technical access control. GitHub permissions and branch protection should be configured separately so `main` requires review and cannot be changed through an unreviewed direct push.
