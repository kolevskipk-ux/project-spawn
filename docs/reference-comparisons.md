# Inventory reference comparisons

Operations and customer inventory use `compareReferences` to compare each offer separately with the stored Amazon México and Collectr references. This is historical context, not MSRP verification or a purchase recommendation. No external price fetch runs when loading inventory; this change adds no ingestion job, cron, reference backfill, or Pokémon Center source.

A percentage requires a mapped product with matching category, language and supported variant; a positive verified offer price observed within 24 hours; and a positive reference with a trusted HTTPS source and nonfuture capture date. Amazon also requires exact match confidence. Collectr requires a usable stored USD/MXN rate. Its exchange-rate capture date is absent from the existing schema and is explicitly disclosed. Old reference observations remain usable as dated historical context, never as current prices. International comparisons exclude shipping and import charges.

Operations cards expose the reason a comparison is unavailable. The coverage summary counts stored inventory offers before Catch deduplication and is independent of the selected visual filters. Catch cards may show references from an inventory record with the same Amazon ASIN, but do not calculate a difference from Catch's free-text price field.

The private customer source retains all existing publication and withdrawal gates. Its public projection includes only display fields and checked reference evidence; private product IDs and raw catalog fields remain internal. Customers see dated references, differences where possible, or an unavailable message. Set/store facets continue to come from published inventory. Watermarks remain on each card and customer downloads remain disabled.

## Read-only production audit

Snapshot: 2026-09-06 18:56 UTC. Counts describe stored evidence at this instant; they change as prices expire or inventory changes.

- Entire catalog: 26 products; 2 Amazon references with source/date; 15 Collectr references with source/date. Five benchmark candidates await review.
- Entire inventory: 340 records, 69 linked to a product, 241 with a numeric price. A numeric price alone does not establish verification.
- Operations board query: 47 deduplicated eligible offers. Thirty lacked product mapping, 12 had unverified offer prices, two lacked prices, and three passed offer checks. Two had an eligible reference as well. The references available to these offers were Collectr; neither stored Amazon reference joined these board offers.
- Customer publication query: 58 published offers, 10 with displayable historical reference evidence, two with a fresh offer price and a calculable difference. Customer eligibility and operations deduplication are different scopes, so totals are not expected to match.

This establishes that absent comparisons cannot all be attributed to failed external reference searches. Review mappings and existing pending evidence before deciding whether another source is needed. No production records were modified for this audit.

## Release

This change is stacked on PR #39 (Amazon feed timeout and dynamic operations sets). Merge that prerequisite first, then retarget/review this change against main. Deploy the private customer source and customer Worker as well as the operations Worker; updating operations alone cannot update the customer UI. No database migration is needed. Keep production deployment separate from staging validation and the reviewed merge. Existing production support-secret setup is unrelated and remains a separate rollout item.

Validation covers independent source math, stale/unverified/placeholder offers, identity and quantity mismatches, invalid reference evidence and FX, the customer field allowlist, publication withdrawal, watermark retention, and existing automatic operations filters. Local browser previews use synthetic data only.
