# Garfield functionality map

Reviewed October 19, 2026. This is the coordinated functionality and activation
snapshot for Spawn, Scout and Catch. Historical release notes describe their
dated release, not current activation. A deployed capability can be disabled,
paused, or expired; an accepted receipt does not by itself establish stock.

## Status definitions

| Status | Meaning |
| --- | --- |
| Deployed | Installed code or schema exists in production; activation is stated separately. |
| Enabled | The runtime flag or service permits work within its scope and safety gates. |
| Paused or disabled | Code remains deployed, but the relevant acquisition or delivery path is inactive. |
| Expired | A bounded authorization window ended; an enabled flag does not renew it. |
| Experimental | Isolated test capability; no production scheduling or efficacy claim. |
| Proposed | Discussed future work; not implemented or activated by this documentation. |

## Responsibilities and current activation

| Capability | Owner | Current status and boundary |
| --- | --- | --- |
| Market discovery | Spawn | Deployed and enabled. Three-hour market windows and a bounded 04:05 Mexico City early-ASIN sweep. Web search finds evidence, not exhaustive inventory or verified stock. |
| Discovery scope | Spawn | 30th Celebration, Ascended Heroes, Delta Reign and the exact Hobbit Collector Booster Box pilot. Early-ASIN search covers only 30th and Delta Reign. Heavy Hitters is not an explicit ongoing search family. |
| Identity, language and publication review | Spawn | Deployed. Discovery, inventory visibility, published monitoring eligibility and actual collector enrollment are separate states. Unknown language is explicit; multilingual evidence must not borrow another variant's pricing identity. |
| Operator and customer inventory | Spawn | Deployed. Individual operator access and audited decisions; customer eligibility and privacy/support workflows are separate. Customer page views read stored data and do not trigger retailer acquisition. |
| Curated pricing and link metrics | Spawn | Deployed. Reviewed reference evidence and language-specific identity remain distinct from observations. Inventory link tracking is enabled; Amazon hunt links remain direct. |
| Amazon browser acquisition | Scout | Deployed and enabled on the Linux server. Firefox 0.5.7, fixed 16-ASIN list: 14 anniversary and two Delta Reign products. Four hot products target four minutes; others twelve minutes, plus up to fifteen seconds jitter; at most six due products per tick. Foreground reads remain serial. |
| Ordinary shopping continuation | Scout | Deployed in 0.5.7. One guarded click and bounded reread; reject CAPTCHA inputs, robot wording, sign-in, foreign form actions and POST overrides. Validate product identity and qualifying seller evidence after navigation. Persistent or genuine challenges retain backoff. |
| Walmart browser acquisition | Scout | Separate marketplace service 0.4.4, two approved products, thirty-minute schedule. Usable Walmart page readings observed; this does not establish continuous availability. |
| Mercado Libre browser acquisition | Scout | Same separate service, five approved identities. Paused/unavailable listings and an unconfirmed offer remain unknown stock. Account verification can still require human action; no CAPTCHA automation or implicit seller approval. |
| Collector intake and coverage | Spawn | Deployed. Scoped authenticated receipts, freshness, collector state and offer qualification are separate. A title-matched inconclusive Amazon offer can refresh page coverage without becoming verified stock. Marketplace collector labels are diagnostics, not authorization. |
| Health and recovery | Spawn and Scout | Enabled health reporting and protected server watchdog. Watchdog checks every two minutes, restarts only an already-active stale Amazon service, capped at one/hour and two/day. Manual pauses, challenges, cooldowns and planned breaks are protected; it cannot recover a powered-off server. |
| Reliable-store acquisition | Spawn coordination and Catch fetching | Deployed, pilot expired. Seventy-five enrolled, six Dino Cards targets held after HTTP 429, sixty-nine eligible across five stores. Effective ten-minute pilot cadence ended October 15 at 01:53:47.969 UTC. No extension or broad-monitoring restart is authorized here. |
| Catch legacy Amazon and marketplace acquisition | Catch | Deployed but paused by enabled stores-only mode. This includes legacy scheduled Amazon polling, buying-options recovery, Walmart/Mercado Libre acquisition and drop-search acquisition. Catalogs and baselines remain stored. |
| Customer event and Scout advisory delivery | Catch | Enabled, subject to eligibility, suppression, deduplication and applicable quiet hours. Buying Options advisories are explicitly unverified; they do not certify stock, seller or price. Marketplace customer stock alerts remain disabled. |
| Paid acquisition and broad store maintenance | Catch and Spawn | Catch paid browser fallback disabled; drop recovery disabled. Spawn broad store catalog sync/fast maintenance, general inventory revalidation, enrichment and automatic approval/digest flags are disabled. Scheduled market discovery remains active. |
| Legacy Amazon daily hunt digest | Catch | Disabled; not a substitute for live readings. |

## Evidence and release snapshot

- Spawn main includes PRs 41–45. PR 45 merged as `63d3c5d`; current Worker version
  `201d3ed5-3a29-449c-a6d1-dd797bae5851`, 100% traffic, deployed October 19
  at 22:07:57 UTC. Configuration `8.7.0-inventory`.
- Scout Amazon 0.5.7 and marketplace 0.4.4 are separately installed server
  extensions, not Worker versions. Credentials and profiles were preserved.
- Amazon recovery validation at 22:05:47 UTC: three automatic batches, sixteen
  accepted readings, zero read errors/challenges/intake failures, sixteen fresh
  targets. Follow-up at 22:30:50 UTC still showed sixteen fresh targets, enabled
  monitoring and no stop/cooldown. No live continuation gate occurred in these
  checks; the click/navigation path passed offline browser fixtures.
- Catch main includes PR 34 (`e2dd7fe`). Live release `V8.9.0-rc.4`, build
  `reliable-store-pilot-20261013`, Worker version
  `14647500-48c6-470a-8366-f7a4c9432fa9`, 100% traffic. Stores-only mode remains
  enabled after expiry. The Spawn pilot flag also remains enabled, but expiry
  prevents new claims.
- Final retained-store pilot evidence: 7,506 usable observations of 7,524
  (99.76%); all sixty-nine eligible targets had successful observations. Eleven
  already-started receipts completed about seventeen seconds after expiry;
  none later. This is the measured pilot window, not current ongoing coverage.
- Measured surrounding account usage remained within the included allowances
  at the dated audit. Those totals include other workloads and are not a
  pilot-only invoice or a guarantee of future cost.
- Spawn discovery audit through October 19: 59 of 62 runs since October 12
  succeeded. October search accounting estimated USD 35.694, no held reserves,
  against a USD 150 application budget. Provider invoices and hosting are separate.

## Current gaps

- Twenty Amazon monitoring targets are published in Spawn, but Scout accepts
  only its fixed sixteen. Outside Scout: Delta Reign Three Booster Blister
  `B0HG3JBNBN`, Delta Reign Build & Battle `B0HG47DGH4`, Pitch Black
  `B0H27L3TKW`, and Hobbit Collector Booster Box `B0GXC89N66`.
- Sixty older Amazon seed listings were published for inventory visibility only;
  they are not automatically enrolled in monitoring.
- Figure Collection `B0H788HLPY`, discovered October 14, is review-eligible with
  a delivered notice, but identity and language remain unresolved. Heavy Hitters
  `B0HKVJPJGW` is absent from retained inventory, watchlist, candidates and scan
  results. The older Heavy Hitters ASIN `B0G882HQVC` is a separate identity;
  equivalence or edition has not been verified.
- `/approvals` defaults to approved inventory; pending review is
  `/approvals?view=queue`. The listing queue shows the oldest 200 of 230 eligible
  pending rows, hiding the recent Figure Collection there; its Amazon product
  approval card remains available separately. Coverage still uses Catch telemetry,
  and the monitoring destination still says Catch. These UI fixes are proposed.

## Experimental and proposed work

**Experimental:** two concurrent page preparations with one serialized reader.
Only synthetic local timing exists; production concurrency is one. The experiment
does not justify a production speed or challenge-reduction claim.

**Legacy deployed capability, currently inactive:** the authenticated catalog
supports a silent hourly staging feed for independently verified 30th/Delta Reign
identities. Catch stores-only mode pauses its acquisition; there is no dynamic
staged-target enrollment in Scout. Do not confuse this with the proposal below.

**Proposed staged-ASIN flow:** evidence-backed, relevant, previously unseen ASIN
→ identity evidence and explicit staged record → quiet bounded Scout monitoring
→ operator review of meaningful page/offer changes → separate customer publication
and alert eligibility. A staged listing can be worth observing before a price or
purchase button exists; it does not establish an imminent launch or verified
availability. No guessing ASINs or customer alerts for unapproved staged products.
Broader discovery families, target/cadence caps, dynamic Scout and intake allowlists,
expiry/review policy, deduplication, and dashboard states need implementation and
review. The new Heavy Hitters ASIN has not been enrolled by this proposal.

## Documentation maintenance

Every functional release updates this map and the affected component state/runbook
in the same work item. Keep this map and `GARFIELD.md` identical in both repositories.
Record code/PR, deployment or installed version, activation flags, scope/cadence,
verification time/results, limitations, rollback and any expiry. A merge, deploy,
flag activation and verified outcome are separate events. Label historical records
and proposed features explicitly; do not infer live operation from code presence.
Documentation-only changes do not authorize deployment, enrollment, pilot renewal,
new acquisition, spending or customer messages.
