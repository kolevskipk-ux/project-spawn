# D1 read-cost repair — September 19, 2026

Status: approved by Philip and deployed September 19, 2026, approximately 17:23
Mexico City time. Source release: 87595af0102102a84c5e670bdfcc1df51bafed58.

Query Insights supplied by Philip showed 178.09B reads for 22,050,616 individual
queue insertion attempts, 121.07B reads for next-page selection, and 86.86B reads
for inventory revalidation selection. These three queries account for about 95%
of the displayed 407B reads; the screenshot date ranges must match for that ratio.

## Changes

- Queue URLs in atomic batches of at most 500. Each statement computes remaining
  capacity once and excludes existing URLs by the queue primary key. Stop when
  the 25,000-page cap is reached. Discovery handoffs use the same cap and do not
  acknowledge a URL that could not be queued. Existing failed URLs can retry.
- Choose robots, approved discovery, then ordinary pages with indexed lookups.
  Preserve product/feed/sitemap/other ordering. Scope discovery to its store.
- Migration 0044 adds five indexes for page selection, discovery URLs, latest
  accepted candidates per listing, and Amazon URL exclusions. It does not delete
  records, reset monitoring baselines, or change schedules and browser budgets.

## Validation

311 tests passed across 37 suites; TypeScript passed. New SQLite integration
tests cover duplicate frontiers, competing batches at capacity, retry at capacity,
selection order, and indexed plans without temporary queue sorting. All 44
migrations applied successfully to an isolated local Cloudflare D1 database.

Run `scripts/benchmark-d1-read-cost.py` with Python for a reproducible comparison
against source commit 1a1a932. Synthetic fixture: 10,000 queued pages, 10,000
candidate records and 100 discovery handoffs. SQLite VM instruction counts:

| Operation | Before | After |
| --- | ---: | ---: |
| 500 duplicate enqueue attempts | 15,049,503 | 37,572 |
| Next-page selection | 4,219,832 | 112 |
| Latest candidate lookup for 100 listings | 3,075,394 | 1,705 |

These are local execution-work measurements, not D1 billed rows or a promised
bill reduction. The complete revalidation query still scans eligible inventory;
the new index removes its repeated candidate-table scans. Other query costs remain.

## Production release proposal

Obtain explicit approval for production migration and deployment under AGENTS.md.
Use a clean release checkout excluding existing unrelated inventory-operations
edits. Apply only pending migration 0044 after confirming migration history; run
Worker deployment as a separate operation. Do not use the combined npm deploy
script. Preserve all production variables, routes, bindings and cron triggers.
Index creation has a one-time database read/write cost and may briefly contend
with active queries. Do not reset or delete existing monitoring data.

Verify health and normal monitoring after release. Compare matched time windows
in D1 Query Insights: old per-URL INSERT and old page-selection SQL should stop;
new INSERT count should reflect batches; revalidation rows per execution should
fall. Compare total rows read per hour, including other workloads, before claiming
success. Browser recovery remains separately budget-blocked.

Rollback: restore the previously active Worker version. The additive indexes can
remain; old code is compatible with them. Record the live version before rollout.
## Production verification

- Migration 0044 was the only pending migration and was applied separately;
  six migration commands completed in approximately 5.65 seconds.
- Worker version: 1e590e97-c33b-4341-9d29-45cc8f2ece58.
- Previous version for rollback: 470c9269-5e26-4bdb-913c-57890acfa64a.
- Deployment used the clean release checkout and `--keep-vars`; existing cron
  expressions and bindings were retained. No monitoring baselines were reset.
- `/healthz` and `/readyz` both returned `ok: true`.
- All five indexes exist in production. EXPLAIN QUERY PLAN confirms the latest
  accepted candidate lookup uses monitoring_candidates_listing_status_latest.
- Scheduled catalog ticks were recorded at 23:23:44 UTC after deployment.
- GitHub main was verified at source release 87595af before this documentation
  update. The original unrelated working edits remain outside the release.
- Initial remote D1 read returned transient error 7403; retry succeeded before
  migration. No changes were attempted while that read failed.
- Initial five-minute D1 Insights query returned an empty array. Production
  billing reduction is not yet measured; local benchmark gains are not a live
  savings claim. Browser budget settings were not changed.
