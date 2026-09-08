# Discovery reliability release — prepared 2026-09-08

Local implementation, pending production approval. Includes the previously
prepared USD 150 search budget, consecutive-empty review and search audit trail.

## Changes

- Migration 0029 preserves historical scan/observation data and dependent search
  accounting/review rows while repairing both CHECK constraints. It admits
  `early_asin` and current Catch observation states. Distinct observations may
  share a transition; observation IDs remain the deduplication key. Invalid
  observation values now fail rather than disappearing through INSERT OR IGNORE.
- Spawn confirms the stored observation ID in its acknowledgement. Catch requires
  this acknowledgement and retains a separate inventory-delivery result, rather
  than interpreting any HTTP 2xx as evidence of persistence. Status exposes
  `lastSpawnInventoryDelivery` separately from benchmark forwarding.
- Search rotates across four approved product families and Amazon/additional
  retailer discovery, with at most 40 known URLs and 80 recent model-reported
  source outcomes. The assignment and full request are captured by the existing
  search audit. These are model instructions, not guaranteed query allocations.
  Mandatory baseline checks, the exact Hobbit pilot, vendor suppression and
  approval boundaries remain. Early-ASIN requests retain their Amazon-only scope.
- Search uses Mexico location context and English/Spanish query variants. Query
  language does not establish card language. The response schema requests
  per-source coverage and explicit gaps. Relevant expensive/unavailable listings
  are no longer filtered out solely on purchase suitability. Inaccessible pages
  remain coverage gaps, not verified inventory.
- Catch retains unique KV records for check starts, completions, exceptions,
  scheduler decisions/quiet skips and Spawn inventory-delivery attempts for 30
  days. Unique records avoid lossy concurrent read-modify-write counters.
  `summarizeMonitoringAudit` aggregates exported records by attempt ID, including
  starts without terminal results. These are recorded main-check outcomes, not
  proof of all intended checks, buying-options acquisition success, recall or
  restock-to-alert latency. Scheduler summaries supply context for backoff/cadence.

## Validation and limits

Local tests use mocked acquisition/delivery, a complete SQLite schema and a
populated pre-repair database with foreign-key enforcement enabled. Preservation,
current observation states, acknowledged delivery, missing/wrong acknowledgements,
early-ASIN execution, search assignment rotation and monitoring summaries are
covered. No paid validation searches or production data changes were used.

The search budget remains an application estimate with reservations, not a
provider-enforced invoice cap. Search assignments may improve coverage; their
effectiveness requires a fresh production measurement window. The test suite
cannot demonstrate live Amazon accessibility.

Historical Catch records that were silently discarded cannot be recovered by
this migration. The new KV history expires after 30 days; export it within that
window for a longer audit. Reads may lag because KV is eventually consistent.
Missing audit writes are logged and must not be interpreted as successful checks.
The audit is operational evidence, not tamper-proof storage. No extra customer
Discord integrations, inventory revalidation or faster monitoring are activated.

## Production sequence (approval required)

1. Inspect active versions, effective flags and applied migrations; back up D1.
   Apply only the pending approved migrations 0027, 0028 and 0029, in order.
   Migration 0029 rebuilds tables transactionally and must preserve row counts and
   pass `PRAGMA foreign_key_check` before release proceeds.
2. Upload and activate the reviewed Spawn Worker while retaining effective vars.
   Validate its final active revision after any automatic release finishes.
3. Reconcile current-month search spend through the previous version's last
   in-flight request, then enter the opening balance in the protected admin page.
   New paid requests remain blocked until that balance exists. The repaired
   04:05 Mexico City early-ASIN job can now run: this is an additional working
   daily search under the same budget, although the cron configuration is unchanged.
4. Upload and activate Catch only after Spawn returns the new persisted-ID
   acknowledgement. Retain monitoring cadence, delivery flags and baselines.
5. Observe ordinary scheduled traffic: confirm persisted rows, acknowledged IDs,
   check records, budget settlement and search assignment/source evidence.
   Never seed fake production observations or trigger extra paid scans merely
   to validate the release.
6. After seven complete days, compare classified checks/recorded attempts, block
   and error rates, acknowledged inventory deliveries, new listings per estimated
   dollar, repeat share and coverage by product family/source. Review at the
   existing 100-consecutive-empty-scan threshold sooner if reached. Do not change
   cadence or activate known-inventory revalidation solely from a healthy snapshot.

Rollback order: Catch first if rolling Spawn back to the old acknowledgement
contract. Keep additive audit records and repaired schema; do not down-migrate
or reset baselines. Reverting to pre-accounting Spawn removes the budget guard,
so paid dispatch must be paused and that interval reconciled before resuming.
