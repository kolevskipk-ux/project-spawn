# Baseline production release — 2026-09-07

User approval: merge and deploy Catch first, then Spawn. No product approvals, database migration, budget increase, or cron change was included.

| Component | Approved merged commit | Production version |
| --- | --- | --- |
| Catch | `8258af7` | `4e41dcaf-815e-46de-8424-4d86a1fab3cd` |
| Spawn | `ef4f4d8` | `10fd3201-efaf-496e-a673-9415b34d350e` |

Both reviewed branches were fast-forwarded and pushed to their repositories' `main` branches. Production versions were uploaded with the commit tag and `--keep-vars`, then activated using `wrangler versions deploy`. No `triggers deploy`, migration application, reset, manual retailer scan, or product decision was executed as part of this release.

## Verification

- Catch was deployed first and successfully consumed the original v1 catalog, version 4, with all 19 target IDs/ASINs unchanged and no catalog error.
- Spawn health and database readiness returned HTTP 200 with `ok: true` after deployment.
- Production operating flags, binding names, database/KV resource IDs, and applied migration inventory matched the pre-release audit.
- At 23:23:17 UTC, Catch confirmed catalog schema **2**, version **4**, all **19** existing targets, source `spawn-published-catalog`, and no catalog error. The normalized catalog hash remained identical to the pre-release hash; only the schema envelope changed. Customer delivery remained in its existing `deliver` mode. Spawn database readiness passed.
- Both approved commit-tagged versions were confirmed active at 100%. See `baseline-production-release-evidence.json` for the final version IDs, catalog hash and checks.

## Deployment reconciliation

An untagged Spawn deployment (`88123684-219b-4662-9fe3-3b325202bd0e`) appeared at 23:18:47 UTC after the merge and initial tagged release. Its cause was not proven in this task. The audited operating bindings matched the previous configuration. The approved commit-tagged version was explicitly restored at 100% rather than assuming the untagged version's source. Before future releases, inspect Git-connected build automation to avoid competing deployment paths. Do not infer that absence of GitHub Actions means no deployment automation exists.

## Rollback

Previous production versions: Catch `04855d87-178e-4a0f-b273-21c1e838787d`; Spawn `e9a94f8e-6390-4944-903d-209bbfa61015`.

Keep the new dual-version Catch reader if rolling back Spawn. Do not roll Catch back to its v1-only reader while Spawn serves v2. Preserve existing state and decision history; no baseline reset or deletion of approvals is part of rollback.

## Separate follow-up

The daily browser budget was already at its safety threshold before this release. This release does not increase monitoring workload or approve new targets. Broader coverage should follow a capacity review. Exactly-once Discord delivery across crashes/concurrent KV writes remains outside the claims of the completed rehearsal.
