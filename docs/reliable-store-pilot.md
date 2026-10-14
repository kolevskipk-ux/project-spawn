# Reliable store pilot — October 13, 2026

Philip authorized a 50–100-target ten-minute store pilot within existing Cloudflare
allowances. Initial selection: 75 healthy named-hunt products across The Frog House
(25), Monster Sprim (14), Ziggytoys (13), Collector Realm (9), Onigashima TCG (8),
and Dino Cards (6). Candidates had a successful observation within 24 hours and
zero consecutive failures. Approval, vendor suppression and item rejection checks
remain enforced at claim and receipt time.

A 429 observed on any pilot target holds its entire store out of further pilot
claims for review, preserving enrollment and evidence. Initial production reads
triggered this hold for Dino Cards; 69 targets across the other five stores remain
eligible. This prevents the pilot from increasing requests against a rate limit.

Scout owns browser acquisition for Amazon and the separately scoped marketplace
collectors. Catch's stores-only mode stops scheduled Amazon, buying-options, drop
search, Walmart and Mercado Libre acquisition, while preserving Scout advisory
delivery and customer-event delivery. The legacy Amazon informational digest is
not run in stores-only mode. No new cron is installed and paid browser support is
disabled for this pilot. Broad catalog discovery and revalidation stay paused.

Migration 0048 is additive: explicit pilot enrollment, a target/observation index,
and customer-event rejection records. Original target cadence and all baselines
remain intact. Pilot responses carry an effective ten-minute cadence. Checks are
staggered over ten minute slots, bounded to 12 claims per minute, and use existing
quiet hours. Errors preserve evidence and back off. A configured expiry stops new
pilot claims; expiry does not automatically restore broad monitoring. The pilot
requires 50–100 enrolled targets and lasts at most 24 hours before review.

`/ops/store-coverage` shows enrolled products, successful-read freshness, latest
attempt, failures, evidence and maintenance candidates. Repeated 404s are review
candidates; no products are deleted or automatically marked sold out. Invalid
customer events are quarantined for review, rather than retried indefinitely.
Historical campaign envelope omissions are repaired on feed projection only;
campaign announcements older than seven days are suppressed instead of replayed.

Account-wide analytics, September 22 through October 14 01:49 UTC: 986,630,295
D1 rows read; 4,301,447 written; 9,392,430.960 Worker CPU milliseconds; 611,702
Worker requests; 1,408,954 KV reads; 493,628 KV writes; 268,894 KV lists. These
are usage analytics, not an invoice or a contractual hard spending cap. Current
headroom supports one bounded day with no paid browsers, AI discovery, or expanded
catalog. Read/write/CPU/KV totals must be measured before extending the pilot.

Collector audit: Amazon server is active. Latest marketplace receipts exist,
but five Mercado Libre products report TAB_MISSING and two Walmart products are
unknown. The server's installed marketplace package is a local-only test and is
not loaded in the production Firefox session. Do not describe either marketplace
as verified live inventory coverage until a real successful page read is observed.

Validation: Spawn TypeScript and 361 tests pass; Catch's complete 14-script suite
and the new acquisition-isolation test pass, including Worker runtime checks.
Compile-only bundles passed for both Workers.

Release order: record active versions; apply only 0048; deploy compatible Spawn;
enroll reviewed products; deploy stores-only Catch; activate the dated Spawn pilot;
verify natural checks and costs. Migration, version upload/deployment and
activation are separate operations. Roll back by restoring the recorded Worker
versions; additive tables/indexes and monitoring evidence remain preserved.
