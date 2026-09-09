# Existing-store catalog onboarding

## Automation update — authorized 2026-09-09

Philip authorized automatic store ingestion after reviewing the manual workflow.
With `STORE_CATALOG_SYNC_ENABLED=true`, pending independent stores receive their
first audit automatically. Audits resume in background batches every 15 minutes.
Completed pending audits wait for category approval; approval authorizes automatic
import batches and subsequent catalog refreshes. Paused, rejected, and suppressed
stores remain excluded. No whole-store approvals are inferred or created.
The portal shows queue/progress instead of requiring manual batch clicks. Failed
initial audits remain visible for a deliberate recheck rather than endless retry.
The eight-page batch and existing per-store refresh intervals are unchanged.
Deploy the code with scheduling off first; activate separately after validation.
This update supersedes the manual-start requirement below.

Implemented 2026-09-09 on `codex/store-catalog-onboarding`. This is the first,
existing-store phase of the store-first discovery proposal. It adds no paid AI
calls and does not change the current paid listing-search algorithm or budget.
New-store AI acquisition and broader Catch monitoring/delivery remain subsequent
work; this release must not be described as that complete redesign.

## Operator flow

Open `/ops/stores` from Store acquisition in the protected sidebar. “Find stores
in existing inventory” creates one pending record per exact HTTPS origin. It
does not inherit whole-store approval from existing product/trusted-store rules.
Repeated audits preserve every approval, rejection, and pause.

Inspect a store to create a resumable catalog job. Process batches manually while
scheduled work is disabled. Review found items, supported identity/offer evidence,
additional URLs, failures, and the monitoring workload estimate. Choose from the
four existing watch categories and a 6/12/24-hour refresh interval, acknowledge
the scope, and approve. Approval starts the first import batch. Remaining batches
can be processed manually or by the activated scheduler. Review revisions and
unfinished-audit checks prevent stale approval. Decisions retain actor and time.

Whole-domain approval is unavailable for recognized marketplaces. Vendor
suppression, including inventory retailer aliases on the same origin, blocks work.
Existing seller trust is preserved; stable-seller catalog enumeration is not yet
implemented. Pending stores are not automatically crawled until an administrator
starts an audit. Paused/rejected stores stop processing.

## Acquisition and coverage

The worker checks robots.txt, sitemaps, Shopify-style public product feeds, and
same-origin storefront links. It prioritizes known product pages. Descriptive
product URLs and feed titles are filtered to the current four watched categories;
generic or unexpected naming may be missed. Product sitemaps take precedence over
unrelated blog/page indexes. URL aliases for Shopify collection paths and English
locale paths link to existing inventory IDs without replacing curated values.

Each tick handles at most eight pages, with six-second fetch timeouts, two-MB
response limits, and a 2,500-page frontier ceiling. The pending frontier is durable
and stores rotate fairly between ticks. Redirects require review. Robots failures
and access errors remain explicit; they never become sold-out evidence.

JSON-LD must identify the exact product page. Conflicting variant offers are held
outside import. Available, sold-out, and explicit preorder identities are retained;
preorder buyability/price remain unknown. Unsupported identities stay visible for
review. “Complete” means the accessible scoped frontier ended, not whole-store
completeness. A missing optional feed, inaccessible detail page, or page ceiling
can leave a run partial. Missing products are not deleted or marked sold out.

## Ingestion boundary

Imports insert new inventory and link existing records. They never overwrite
curated inventory, revive rejected product candidates, change global inventory
baselines, create per-product approval notifications, or publish customer events.
The initial import stays a baseline across all batches; later additions are marked
new. Current catalog evidence refreshes in the store audit view. Existing inventory
refresh/monitoring remains owned by its current pipeline.

Ingestion does not assert domestic fulfillment, customer publication, or Catch
receipt. Newly inserted rows remain fulfillment-unverified until that evidence is
reviewed through the existing flow. They can be inspected in the store view and
inventory diagnostics; they are not promised visibility in the customer feed or
the fulfillment-filtered Inventory Board. Non-Amazon Catch adapters, agreed hot/
warm/regular cadences, and store/new-inventory announcements are not in this phase.

## Schedule and capacity

`STORE_CATALOG_SYNC_ENABLED=false` is the shipped default. When explicitly enabled,
the existing 15-minute maintenance ticks resume audits that admins started, import
approved batches, and begin due approved-store scans. A global lease prevents
overlapping batches. The selected interval is measured from scan completion;
backlog can delay the next scan. At most 32 pages/hour are processed across the
fleet, excluding additional direct manual batches. This is a conservative initial
capacity setting; it does not guarantee a full 56-store refresh every six hours.

## Validation and rollout

The read-only production snapshot contained 359 listing rows on 56 exact origins,
including four recognized marketplace origins. The saved snapshot and bounded local
rehearsal are in `artifacts/store-inventory-audit.json` and
`artifacts/existing-store-rehearsal.json`. Rehearsal uses an in-memory SQLite database,
not production state. Repeat locally with `node scripts/audit-existing-stores.mjs`
or `--inspect=3` to additionally fetch up to eight public pages per independent store.

TypeScript and all 232 tests pass, including real SQLite migrations, approval
revisions, paused/suppressed/rejected stores, robots/redirects, resumption, alias
deduplication, baseline batches, and customer-notification isolation.

Production operations remain separate and require approval:

1. Apply additive migration `0033_store_catalog_onboarding.sql`.
2. Deploy the reviewed Worker with catalog scheduling disabled. Do not use the
   package deploy script, which combines migrations and deployment.
3. Audit current stores and review the first store in the portal.
4. Separately activate the scheduler after reviewing coverage and fleet capacity.

Rollback disables the feature flag and restores the previous Worker. Existing
decisions, receipts, and imported inventory remain; no destructive rollback or
monitoring-baseline reset is required.
