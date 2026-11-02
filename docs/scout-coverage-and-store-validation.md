# Bounded Scout catalog and reliable-store validation

Prepared November 2, 2026. New coverage and pilot renewal are not activated.

## Amazon scope

Live audit found twenty published watchlist identities and sixteen installed
Scout targets. The prepared 0.6.0 overlay uses a server-authenticated, versioned
catalog instead of requiring a new extension build for each eligible publication.

Initial eligible set: the existing sixteen plus Delta Reign Three Booster Blister
B0HG3JBNBN, Delta Reign Build & Battle B0HG47DGH4, and Hobbit Collector Booster
Box B0GXC89N66. Pitch Black B0H27L3TKW stays held: language is unknown and its
category is outside this first expansion. No identity, language or publication
approval is invented or changed by enrollment.

The cap is twenty, with the original sixteen prioritized while still published,
English and not removed. Future published English targets are eligible only in
30th Celebration, Delta Reign, and exact Hobbit Collector Booster Box categories,
with canonical Amazon Mexico URL, valid approval timestamp and an identity
pattern. Unknown language, unsupported scope, ambiguous titles and capacity
excess are held. Existing targets keep their identity patterns. New generated
patterns consist only of escaped/bounded alphanumeric title tokens; URL and DOM
ASIN, page title, challenge and seller/purchase evidence guards remain mandatory.

Only PUBLISHED watchlist rows are considered, never inventory-only seeds,
unpublished discoveries or silent staged identities. Lookup is capped at 201
rows and fails closed if the explicit 200-row review boundary is exceeded.
Inventory removals suppress enrollment. Review `/ops/scout/coverage` for eligible
and held identities. Publication, enrolled catalog, successful reading, seller
qualification and customer publication remain different facts.

Four current hot products remain on four-minute cadence; all additions use
12 minutes, positive jitter up to 15 seconds, at most six due products per tick,
serial reads, existing deadlines/cooldowns and manual pause protection. The first
three additions size to about fifteen additional due checks/hour, not a timing
guarantee. No hot promotion or concurrency increase is included.

Catalog refresh is attempted at most every five minutes during collector runs,
with an eight-second request deadline and thirty-minute cache validity. Requests
refuse redirects. Only still-valid retained catalogs can survive connection
failures; an expired cache stops new product reads and retries through the
existing scheduler. A fresh browser without a retained cache has a five-minute
legacy bootstrap grace; restarting cannot renew an expired retained catalog.
Withdrawals take effect on refresh and are independently rejected by Spawn at
intake. Retained tabs/history/due times are not cleared.

Host reports and watchdog summaries follow the loaded target set (maximum 20).
Diagnostics compare count and version against the current catalog, so a healthy
old sixteen-target export cannot certify nineteen-target coverage. Older v1
reporters remain compatible during rollout. An empty/malformed catalog is not
healthy coverage and cannot authorize a recovery restart.

New target advisory state is baselined on its first readable signal. Enrollment
alone does not emit an initial advisory; a subsequent qualifying transition can
use the existing route, outbox, suppression and deduplication policies. Existing
sixteen-target advisory state and all monitoring baselines remain unchanged.

## Store decision

Prepare the user-selected 24-hour validation at thirty-minute cadence. Retain
75 enrollment rows, hold the six Dino Cards targets after HTTP 429, and allow at
most 69 others across five stores after existing eligibility checks. Do not add
stores, clear a hold, reset a baseline or renew automatically. Retained errors
(including two Ziggytoys failures) must be revalidated, not called healthy now.

Spawn and Catch must both support 30-minute pilot receipts before activation.
STORE_MONITOR_PILOT_CADENCE_MINUTES supports only 10 or 30; default 10 preserves
legacy behavior. New claims require the existing 50–100 enrollment bound and a
valid expiry at most 24 hours away; claims remain capped at 12/tick. Success
schedules the next observation at 30 minutes without changing stored baseline
cadence; errors back off. A 429 holds its whole store. Expiry stops new claims;
existing in-flight leases can finish for up to three minutes. Quiet hours remain.
The UI shows inactive/expired status and held/eligible counts explicitly.

About 138 primary product checks per active hour are expected for 69 targets,
versus 414 at the former ten-minute cadence. Shopify fallback/redirects can add
HTTP requests. This is not a spend guarantee. No paid browser, AI search, broad
catalog crawl, legacy Amazon or marketplace acquisition is enabled. The November
1–2 usage baseline was saved read-only; refresh it at the actual activation and
compare at completion before deciding whether to continue.

## Explicitly approved staged deployment required

1. Merge the coordinated Spawn and Catch PRs. Snapshot both live Worker settings,
   versions and triggers, target enrollment and account usage. Preserve all
   runtime flags, including enabled diagnostics; the November 2 audit found the
   previously deployed owner restart flag off. Its explicit restoration is part
   of this proposed rollout, not an assertion that it is presently enabled.
2. Upload/deploy Worker code without migrations or trigger activation. Keep
   SCOUT_DYNAMIC_TARGETS_ENABLED absent/false and the old expired pilot window
   while both compatible Workers are installed. Verify old operation and auth.
3. Back up the Amazon public files, watchdog script, host reporter and restart
   journal. Apply the five-file public 0.6.0 overlay; never copy or replace
   private-config.js, Firefox profile, baselines or pause/challenge state. Install
   the updated watchdog/host reporter, preserving ownership and mode. Existing
   system timer/unit is unchanged; no new sudo setup should be needed for the
   main-owned reporter script.
4. Restart only the affected Amazon service once as the reviewed public-file
   upgrade requires; record that restart in its existing shared budget. Preserve
   manual pause/cooldown and stop if the service is intentionally inactive.
5. Separately activate SCOUT_DYNAMIC_TARGETS_ENABLED=true and restore
   SCOUT_CONTROL_ENABLED=true. Verify the feed contains exactly the reviewed
   nineteen and holds Pitch Black, client catalog version/count agree, all
   nineteen obtain accepted reads, and hot-product cadence remains healthy.
   Do not fabricate stock or customer alerts as a test.
6. Record a fresh store/account baseline and freeze an expiry of activation plus
   at most 24 hours. Separately activate STORE_MONITOR_PILOT_CADENCE_MINUTES=30,
   retain STORE_MONITOR_PILOT_ENABLED=true, and set the new expiry. Leave
   CATCH_ACQUISITION_MODE=stores-only and paid browser fallback disabled. Keep
   existing cron expressions and all enrollment/hold records intact.
7. Verify new claims are limited to the retained eligible set, Dino Cards remains
   held, actual receipts use thirty minutes, error/429 controls work, and
   operations pages correctly distinguish historical observations from current
   coverage. Save observed usage and accepted/failure counts for final review.
8. At expiry verify new claims stop, record coverage/latency/errors/429s and
   usage deltas. Do not automatically extend based on historical success.

Rollback: stop store acquisition with STORE_MONITORING_ENABLED=false or retain
an expired pilot window. **Do not disable pilot mode to stop the run**: doing so
selects broader catalog monitoring. Restore old code only with a compatible
cadence. For Scout, disable dynamic targets first so the feed returns the legacy
sixteen, then restore backed-up public files/agents if necessary. Preserve all
profiles, baselines, pauses, holds and restart history. Keep diagnostics enabled.
Existing in-flight requests may complete; no hard invoice cap is implied.

## Validation and limits

TypeScript, the full repository suite, Catch tests, offline catalog cache/TTL/
withdrawal/concurrency tests, and isolated Linux watchdog/host tests are run on
this change. The public overlay was built from the installed 0.5.9 public files
without private configuration. Live new-product reads, actual 30-minute store
receipts and mobile browser presentation remain deployment acceptance checks.
