# Individual Amazon product approval

Status: implemented on `codex/simplify-product-approval`; production deployment pending.

The Amazon review card replaces verification, identity resolution, approval and publication buttons with one **Approve product** action. The administrator confirms the prefilled name, set, format and language, then chooses inventory only or inventory with Catch monitoring. The direct listing supplies the evidence URL. Unknown language is an explicit supported choice; ordinary approval notes are optional. Cadence, priority and the initial alert option are under Advanced.

Missing or expired verification is refreshed on submission, without an additional Discord approval request. Inaccessible, mismatched or robot-blocked pages cannot proceed. Missing identity details receive inline errors; the form preserves entries after failures. Mexico delivery still requires confirmation for inventory publication. Existing accepted inventory does not require another publication event. Duplicate Amazon listing/review cards are collapsed into one card.

Inventory publication and Catch catalog publication retain their existing audit records and transactions. If inventory succeeds but Catch publication fails, the response explicitly reports that partial result. Retrying resumes from the approved state without duplicating the inventory event or catalog publication. The success message says Catch acknowledgement is pending; it does not claim a completed Catch poll or live availability.

This release changes individual Amazon approvals. Bulk campaign decisions and non-Amazon review controls retain their existing behavior. It adds no migrations, cron schedules or Catch code changes. Unknown language remains visible in the shared schema-v2 catalog.

Validation: full Spawn typecheck and 166 tests; five Catch suites and shared catalog parity. Added database cases cover both destinations, unknown language, repeat/concurrent submissions, stale evidence refresh, blocked pages, field errors, and authenticated actor propagation. A browser-script test verifies retained entries and retry after inline errors. All acquisitions and notification endpoints used in these tests are fixtures. No production products were approved or published during implementation.

Release procedure: review the branch diff, obtain explicit approval for a code-only Spawn release, upload the reviewed revision preserving production vars, activate that version, and verify authenticated approvals and Catch catalog health. Do not run migrations or change schedules. Rollback uses the previously active Spawn Worker version; no database rollback is needed.
