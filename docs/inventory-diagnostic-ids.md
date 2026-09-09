# Inventory diagnostic IDs

Each stored inventory entry and Amazon watch target receives a permanent UUID v4.
The board displays the UUID and includes it in its search. Inventory CSV exports
include `diagnostic_id`. Select the ID on the card to copy it into an issue report.

Migration 0031 backfills existing entries and installs insert triggers for future
entries. Product names, prices, approvals and observation updates do not change
the UUID. The mapping survives deletion and recreation with the same source key.
Inventory listings and Amazon watch targets have separate IDs; the source field
identifies which record the reported card represents.

Resolve a reported UUID with this read-only parameterized query:

```sql
SELECT source, source_key, diagnostic_id
FROM inventory_diagnostic_ids WHERE diagnostic_id = ?;
```

For `inventory`, use `source_key` as `listing_key` in `inventory`,
`inventory_observations`, `inventory_revalidation_state` and
`inventory_revalidation_attempts`; monitoring candidates use `source_listing_key`.
For `amazon`, it is the ASIN in `amazon_watchlist` and
`amazon_verification_attempts`, and identifies the Catch status-feed row.

Apply migrations 0031 and 0032 before deploying the updated Worker. Philip approved
the production inventory release on September 9, 2026 and explicitly confirmed
the migrations and deployment after the automatic approval gate.
Migrations 0031/0032, Worker activation and schedule activation were completed
as separate operations on September 9, 2026.
Spawn version: `bbe79a14-6486-4bd8-b845-11573ff731c6` (source `62cddac`).
Catch version: `ff0f7131-93bf-44b0-9f1f-166e968db7d0` (source `3757ef0`).
Production health/readiness and both release versions were verified. The migration
generated 359 inventory and 80 Amazon UUID mappings and inserted all seven references.
IDs do not change monitoring
baselines or approval states, and are not access tokens.

The authenticated `/dashboard/inventory-diagnostics?id=<UUID>` view resolves an ID
to approval, ownership, observation and refresh history. JSON is available with
`Accept: application/json`. Access authentication also protects this endpoint.

Spawn owns the UUID mapping. The authenticated schema-1
`/internal/garfield/inventory-identities` feed enriches Catch's existing catalog;
it does not change the catalog hash, monitoring keys or customer delivery IDs.
Catch schema-2 observations optionally carry `target_diagnostic_id` and
`inventory_diagnostic_id`; Spawn validates supplied mappings and stores its own
resolved IDs alongside `source_product_id`. Older senders remain compatible.

Category reference prices are revisioned MXN guidelines, not official MSRP:
English ETB 1100, six-pack booster bundle 629, three-pack blister 349, binder
collection 594, ultra premium collection 3370, poster collection 329 and premium
collection 749. Walmart evidence and its verification status are retained in
`category_price_references` and `data/mxn-category-reference-guidelines.json`.
Future evidence should append a revision rather than overwrite provenance.
Special editions, cases and multipacks are excluded. Historical Amazon/Collectr
comparisons remain available in collapsed details.

The board distinguishes Buying Options, no featured offer, unknown, and verified
sold out. Failed or inconclusive observations never advance trustworthy freshness.
Legacy publication authority and pending inventory approval are shown separately.

Inventory revalidation uses exact-product structured evidence, a five-minute D1
lease, five due listings per invocation, and at most two per domain. The existing
minute-5 hourly job and additional minute-20/35/50 maintenance ticks provide up to
480 attempts/day before domain backoff. Additional ticks only run revalidation.
Catch-owned ASINs are excluded; the target for other accepted inventory is 24 hours.
Blocked or uncertain pages retain old evidence and retry with backoff. Inspect
`worker_state.inventory_revalidation_last` and per-listing attempts for coverage.

Rollback: restore the previous Worker versions and original minute-5 hourly Spawn
trigger, with `INVENTORY_REVALIDATION_ENABLED=false`. Keep the additive migrations
and UUID mapping to preserve stable diagnostic identities.
