# Store first review workflow

Prepared for review October 19, 2026; **not deployed or activated**. This release
implements the approved store-first operations workflow and capped background
imports. Production status remains in the [functionality map](../GARFIELD_FUNCTIONALITY.md).

## Operator workflow

Open **Stores**, which defaults to pending approval. Status tabs show approved,
rejected and paused stores separately. Each page contains at most twenty-five
stores. Click a store to view its combined saved inventory and catalog findings,
twenty-five unique product URLs per page. No customer page or store GET starts a
retailer request.

Products show the newest saved observation, its timestamp and corresponding price
from the same source. Failed monitoring attempts remain separate from last saved
evidence. Technical extraction evidence is collapsed by default. Current inventory
is visible even before a new catalog audit runs.

An item can be approved for inclusion or rejected. A pending store still needs
store approval before its catalog imports. Explicit item rejections survive master
approval, re-audits and imports. Rejection of existing inventory records a reversible
removal with history; approving can undo this workflow's removal but never another
administrator's independent removal. Existing rejected-candidate and suppression
rules remain authoritative.

**Approve store** records the supported current/future catalog policy and queues
saved products for ingestion. **Reject store** stops further acquisition/import
work and retains records; it does not delete historical inventory or receipts.
Recognized marketplaces retain seller-specific review and cannot receive blanket
store approval. Identity, delivery evidence and customer eligibility remain separate
from store approval; it does not claim current stock or start new monitoring.

## Audit feedback and import processing

Start catalog audit returns a 303 redirect to the selected store's audit section
with an explicit queued message. Existing running jobs are reused. With automatic
crawling disabled, the page offers a bounded manual processing action and explains
that starting alone only saves the job. Each audit batch retains the existing
twenty-four-page and 25,000-page frontier limits. No crawling flag is enabled here.

Saved import jobs are independent of crawling. The existing minute tick processes
at most one store chunk of forty catalog rows, using a cursor and a global lease.
Empty queues make one indexed read and no lease writes. Failed jobs become ERROR
for deliberate retry from saved progress; rejected/paused stores cancel work.
Concurrent item/store changes invalidate a batch snapshot so its cursor cannot
skip products whose writes were blocked. New queue generations are revisioned.

The new `STORE_REVIEW_IMPORT_ENABLED` flag defaults to false. Activation enables
only saved-product imports, not retailer fetches, discovery searches, customer
notifications or pilot renewal. Existing monitoring configuration and its expired
pilot claim gate remain unchanged.

## D1 controls and validation

- Store lists use the `(status,id)` index and a twenty-six-row cursor query.
- Inventory pages merge at most twenty-six catalog and twenty-six known-inventory
  URLs before indexed point joins. There are no per-card inventory counts, OFFSET
  pages or inventory-wide summary scans in this workflow.
- Store finding explicitly processes at most one hundred existing inventory rows
  per click with a primary-key cursor; it does not crawl retailers.
- New review and job lookups use primary keys and the due-job index. Additional
  indexes cover recent runs/decisions, pending imports and URL-based candidate
  exclusions. Origin alias guards use indexed URL ranges.
- Read-only presentation uses a direct vendor lookup rather than enumerating all
  origin aliases on each page. Full alias suppression checks remain mandatory on
  mutation/import; controls can therefore report an alias block when submitted.
- Migration 0049 is additive, with no data deletion or baseline resets. Creating
  its indexes has a one-time build cost over existing tables; record D1 metrics
  when applying it. Ongoing costs depend on queue activity, not a zero-cost promise.

`python scripts/benchmark-store-review.py` measures the actual inventory-page SQL
on isolated SQLite fixtures. Both 1,000 and 100,000 inventory rows, paired with the
same number of catalog rows, used 3,675 SQLite VM instructions for a page after
the observation-source fields were added. Record the current script result if
query changes alter this value. This is execution-work evidence, not billed D1 rows
or an invoice estimate. Tests cover schema, guards, pagination, queued feedback,
bounded imports, concurrent review decisions and preservation of item exclusions.

## Rollout and rollback

Obtain separate approval for migration 0049, Worker deployment and import activation.
Merging main can trigger the existing Cloudflare build/deploy pipeline: apply the
approved migration before merging this release. Deploy with the new flag false,
inspect authenticated views and query metrics, then activate capped imports only.
Do not change `STORE_CATALOG_SYNC_ENABLED`, monitoring pilot expiry, paid browser
flags, routes or baselines as part of activation.

Rollback: disable `STORE_REVIEW_IMPORT_ENABLED` first, then restore the prior Worker
if needed. Preserve additive tables, audit history, job cursors and item decisions.
Prior code does not read the new item-review exclusions; recorded inventory removals
and legacy candidate rejections still protect existing items, but defer new store
imports/reapprovals until the compatible Worker is restored. Catch needs no runtime
deployment for this workflow; its companion change updates shared documentation.
