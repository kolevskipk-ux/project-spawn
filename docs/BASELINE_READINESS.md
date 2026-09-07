# Garfield baseline readiness

Date: 2026-09-07. Status: local checks, development deployment and remote Worker/D1 rehearsal passed; production release not approved or performed.

## Agreed operating decisions

- Language describes a product; English is not a general ingestion or monitoring gate. Display unknown language explicitly. `other` requires supporting evidence identifying the language. Never infer card language from the storefront.
- Spawn owns discovery, identity evidence, approvals and catalog publication. Catch owns fast availability state and customer delivery. No shared writable database or additional Worker is introduced.
- Keep established canonical IDs and Catch baseline keys stable. Reviewed new identities are ASIN-and-language specific until a separate grouping review; no cross-language price-reference reuse.
- Existing customer Discord destinations and schedules remain unchanged. The protected dashboard remains the decision surface; Discord links to it.
- Monthly maintenance means a read-only review queue, separate from availability polling. No automatic archival, baseline resets, bulk notifications, or new cron activation.

## Implemented in this change

1. One versioned Amazon catalog contract, canonically maintained in `src/contracts/amazon-catalog.mjs` and vendored unchanged into Catch. The local release command rejects drift. Catch accepts legacy English v1 and multilingual v2. Spawn emits v2. Catalog parsing has moved out of Catch's main Worker.
2. State-aware approval controls, readable errors, and a separate identity-resolution form. Resolution requires a valid independent page attempt less than 36 hours old, an unchanged evidence revision, exact product/set/format, an HTTPS evidence reference, and an administrator reason. Unknown language requires acknowledgement. It appends an immutable verification attempt and does not approve, publish, or silently stage the product.
3. Approval preserves language and validates the route. Publication validates the complete proposed catalog. Concurrent approval/publication records only the successful transition; duplicate identities and catalog overflow fail closed.
4. Catch preserves language through target construction, tracking announcements, availability alerts, and digests. Unknown language is labeled. Existing IDs and baseline data are not migrated.
5. Inventory price mappings require the same language. A correction to a different language clears an incompatible mapping. New language variants without curated price references remain unmapped, rather than borrowing English references or failing a foreign key constraint.
6. Dashboard readiness distinguishes requested/effective cadence, missing Catch acknowledgement, overdue checks, unknown language, and identity reviews due after 30 days. This is operator information, not a guarantee that an unavailable telemetry endpoint means an outage.
7. One local command inventories source/configuration/migration hashes, verifies contract parity, typechecks Spawn, and runs both repositories' tests including a real SQLite-schema, cross-Worker rehearsal with fake retailer and Discord responses.

## Run the review

From `project-spawn`, with the sibling `catch-em-all` checkout present:

```sh
node scripts/baseline-check.mjs --output docs/baseline-readiness-local.json
```

The script uses installed dependencies and Node 24 (including `node:sqlite`). Tests require permission to launch local subprocesses. No deployment, production database connection, real retailer acquisition or real Discord delivery is performed. `--report-only` inventories configuration without claiming tests ran. The report exports only allowlisted operating flags and binding names, never secret values.

Rehearsal scenarios cover Spanish/Japanese/unknown-language resolution, stale and blocked evidence, missing acknowledgement, route rejection, repeated and concurrent decisions, catalog version increments, preservation of existing IDs, language-specific price mapping, failed Discord retry and successful-delivery deduplication. Existing suites additionally exercise retailer blocking, cadence, baseline handling, auth and inventory events.

Final local validation: 158 Spawn tests passed across 23 files, all five Catch test scripts passed, and both development-config Worker bundles passed Wrangler `deploy --dry-run` without uploading. The rehearsal includes the authenticated Catch-to-Spawn inventory return path and verifies that it retains the approved card language. Bundle sizes were 306.81 KiB for Spawn and 958.98 KiB for Catch before gzip.

## Production observation

### Completed deployment rehearsal and configuration audit

On 2026-09-07, development migrations 0024–0026 were applied separately to `project-spawn-dev` (database `d2223ce6-cece-4268-9c98-f8801b9027eb`). Production already had all 26 migrations; no production migration was applied or is required for this release.

Catch development was deployed first to version `1b90922c-0fa8-4768-87fc-7fa4374aa47f`; Spawn development followed at `28bc4f22-3b51-4de9-a21d-2165a38add26`. Both configurations have empty cron lists. Development bindings were audited before deployment: separate D1/KV, no Discord webhook bindings, and Catch's delivery mode is `suppress`.

A temporary authenticated Worker with a dedicated remote D1 database ran the actual Spawn/Catch domain functions in Cloudflare's runtime. Spanish, Japanese and explicitly unknown language passed concurrent approval and publication, one catalog increment, stale-evidence rejection, signed inventory handoff, baseline-identity preservation, and fake-delivery failure/retry/deduplication. The fixture calls made zero retailer or Discord requests. Temporary Worker `garfield-baseline-rehearsal-20260907` and database `9bbb7b48-03e2-4a4e-a6d6-9e24a9f579dd` were then deleted. The stored rehearsal configuration is historical: its database no longer exists, and the runner checks this before touching a secret.

The separately deployed development Catch status also confirmed actual service-to-service consumption at `2026-09-07T23:14:00.793Z`: catalog schema **2**, catalog version **3**, **19** published targets, source `spawn-published-catalog`, no catalog error, customer delivery `suppress`. This check acquired no retailer pages and sent no customer messages.

Before/after audited production versions remained unchanged:

| Worker | Version ID |
| --- | --- |
| Spawn production | `e9a94f8e-6390-4944-903d-209bbfa61015` |
| Catch production | `04855d87-178e-4a0f-b273-21c1e838787d` |

Effective production flags were confirmed from version bindings, including disabled Spawn revalidation/enrichment, enabled seed verification, Catch cadence `full`, and enabled customer events/digest. Credential presence was inventoried by name only. Existing untagged production versions are identified by immutable Cloudflare version IDs, not asserted to match an unproven Git commit.

Evidence: `deployment-audit-before-rehearsal.json`, `deployment-audit.json`, `remote-rehearsal-result.json`, and `staging-release-evidence.json`. The last file records source-tree digests, tested development version IDs and temporary-resource cleanup. Synthetic Worker-runtime tests do not establish exactly-once Discord delivery across crashes or overlapping KV writes; that limitation remains explicit.

Read-only Catch public status inspected on 2026-09-07 around 23:00 UTC reported version `V8.6.1-rc.1`, 19 targets, cadence rollout `full`, normal Amazon circuit state and a recent healthy observation. Browser usage was about 8.10 minutes against the configured 8-minute safety threshold; the latest Buying Options work reported `BUDGET`. This supports reviewing browser capacity before expanding coverage. It does not establish the exact deployed Git revision, all effective configuration, or acquisition success for every target.

Catch's checked-in configuration has `keep_vars: true`; local config alone cannot prove effective deployed settings. Spawn's checked-in configuration disables inventory revalidation and commercial enrichment while enabling seed verification. Confirm deployed settings before declaring either maintenance feature operational.

## Release gates and order

1. Review the paired diffs and local report. Record exact final commits, deployed Worker version IDs, applied migrations, effective operating switches and binding presence. Keep secret values out of reports.
2. Exercise these builds in isolated Workers/D1 with customer delivery suppressed, preserving representative baseline records. Local SQLite tests are not a substitute for this deployment rehearsal.
3. Obtain production approval. Deploy Catch's dual-version reader first, validate continued v1 consumption and unchanged baseline keys, then deploy Spawn's v2 publisher and review UI. This change requires no new migration or schedule.
4. Verify v2 catalog acceptance, language labels, unchanged existing monitoring IDs, actual cadence and one deliberately approved test target's trace. Product decisions remain separate from code deployment.
5. Keep any future database migration, schedule activation or delivery-policy change separately approved.

Rollback: before Spawn emits v2, Catch can return to the previous build. After v2 is active, retain the dual-version Catch reader while rolling back Spawn. Do not roll Catch back to a v1-only reader with v2 targets active: it can reject the catalog and revert to older retained/fallback targets. Preserve state and decision history; do not run baseline reset or delete new approvals as a rollback shortcut.

## Remaining operational work before broader activation

- Completed: immutable deployed version IDs, all applied migration names and allowlisted effective vars are recorded in the deployment audit. Historical Git-commit attribution remains unproven for untagged production versions; retain their immutable version IDs for rollback.
- Evaluate target-by-target freshness and the daily browser budget. New approval volume must fit measured capacity; do not raise limits blindly.
- Completed: concurrent D1 review/publication and sequential delivery failure recovery in an isolated deployed Worker. Overlapping scheduled invocations and exactly-once delivery across crashes/concurrent KV writes are not guaranteed. Audit the existing single-owner delivery paths before choosing stronger coordination/storage; this release does not broaden scheduled workload or change delivery ownership.
- Review existing stale/unknown products through the new workflow. The reported ASIN B0H27L3TKW has not been changed or approved in production.
- Use the monthly queue to assess identity changes, missing families/languages, acquisition failures and candidates for reduced cadence/archive review. New acquisition or automated scheduling requires a separately reviewed bounded implementation.
- Continue extracting Catch acquisition, scheduling and delivery modules in behavior-preserving changes when touching those areas. Avoid combining broad structural rewrites with this catalog transition.

The local milestone is a tested foundation. Production baseline readiness remains contingent on these release and operational checks.
