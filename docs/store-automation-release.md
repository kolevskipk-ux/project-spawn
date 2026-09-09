# Store automation release

Prepared September 9, 2026. Implementation is local; migrations and new feature
activation have not been applied to production.

## Behavior

- One approve/reject decision covers all supported sealed Pokémon and Magic sets.
  Existing per-product rejections and vendor suppressions remain effective.
- Catalog runs resume from saved progress, inspect up to 24 pages per invocation,
  and stop at 25,000 pages. The fast scheduler advances up to three stores per
  minute; each completed run schedules the next discovery pass six hours later.
- Imported products enroll idempotently. Existing target assignments are retained;
  newly enrolled Ascended Heroes products default to warm, every 30 minutes.
- Catch checks exact product pages, acknowledges durable observations and updates
  inventory. The customer projection requires a successful acknowledgement and
  shows a Mexico-delivery note when fulfillment has not been established.
- Baseline imports do not generate individual new-inventory messages. Once useful
  coverage exists, a store announcement is queued for the daily digest.
- Subsequent hot additions are immediate; warm/regular additions are due at 09:00
  Mexico City. Restocks and material price drops are immediate. Missed hunt events
  expire after twice their cadence (minimum 15 minutes), or a contradictory stock
  observation, rather than claiming an old opportunity is current.
- Failed observations preserve last good state and back off. The store detail page
  shows enrollment, acknowledgement, failures, overdue targets and last check times.

## Amazon pending approvals

Expanded policies are tied to a verified seller ID and cover pending/future items
across supported sets. Six candidates can be examined per maintenance invocation;
recent attempts are skipped for 24 hours. Fresh exact-product, seller and domestic
shipping evidence is required. Language must be known for automatic identity
resolution. Product verification and publication still record immutable evidence.
Older imports are marked as quiet baselines; published/rejected products are not
reverified or reset. Interrupted publication is an explicit manual exception.

The trusted-store page summarizes pending outcomes. The operations webhook receives
one daily digest after 09:00 Mexico City, with durable delivery state and retry.
The September 9 read-only production check found 60 DISCOVERED Amazon targets,
20 PUBLISHED targets, and zero enabled seller rules. A representative product must
establish seller trust before the all-sets/backlog expansion can run. This is a
one-time seller decision, not a per-product approval requirement for routine matches.

## Capacity and limits

Catch claims at most 12 store targets per minute, serially per origin with up to
three origins in parallel. Ideal demand is hot/5 + warm/30 + regular/60 checks per
minute; it must stay below 12 with headroom for retries. Thus 720 regular targets
would consume the entire theoretical capacity. Larger catalogs require a capacity
change; the UI exposes overdue work rather than promising an achieved cadence.
Quiet hours remain 02:05–06:05 Mexico City.

Sitemaps, feeds and JSON-LD do not guarantee every product, language or variant.
Blocked pages, ambiguous offers, missing identity and unsupported preorder evidence
remain exceptions. Ingestion is not a guarantee of Mexico delivery. The store
adapter uses no OpenAI or browser calls; existing paid discovery and Amazon browser
usage remain separately budgeted. Discord delivery is at-least-once: durable IDs
reduce duplicates, but a lost response after an external send can still duplicate.

## Activation order

1. Review the Spawn/Catch commits. Apply SPAWN_DB migrations 0034 and 0035 as a
   separate operation. Customer-source queries require migration 0034 first.
2. Deploy Spawn, Catch, customer-source and customer Workers with new flags false.
   Verify health, existing catalog version and existing monitoring baselines.
3. Confirm `ASCENDED_HEROES_HUNT`, `CATCH_INGEST_SECRET` and operations/customer
   routes are configured. The Ascended Heroes secret name was verified present;
   no secret value was read or customer test message sent.
4. Enable Spawn `STORE_CATALOG_FAST_ENABLED` and `STORE_MONITORING_ENABLED`, then
   Catch `STORE_MONITORING_ENABLED`. Verify real successful observations and the
   customer projection before enabling `STORE_NOTIFICATIONS_ENABLED` on both.
5. Approve the intended Amazon seller policy, then separately activate
   `AMAZON_PENDING_AUTOMATION_ENABLED` and `AMAZON_APPROVAL_DIGEST_ENABLED`.
6. Inspect overdue checks, failure counts, pending routes and first daily digest.
   Roll back behavior by disabling the relevant flags; retain additive tables and
   all baselines/receipts. Do not call reset-baseline.

## Verification

Spawn's final 247-test suite passes, including expiry and vendor-alias suppression.
All seven Catch suites pass, including dedicated Ascended Heroes routing and
deferred warm inventory delivery.
The paired-repository integration test drives the real Catch consumer against
Spawn's authenticated handler and SQLite migrations, including customer visibility,
quiet baseline, store onboarding, restock and replay. Cross-repository tests report
their absence explicitly when the sibling repository is unavailable.
Wrangler dry-run bundling passed for all four affected Workers.
