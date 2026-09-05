# Operations production release

Prepared 2026-09-05. Status: production Access setup completed following owner authorization; final database/code cutover awaits approval.

## Reviewed baseline

- Remote `origin/main`: `d16c360` (fetched during preparation). The operations branch descends from it without a newer upstream commit.
- Production Worker: `project-spawn`; existing hostname: `spawn.aztlan-eng.com`.
- Latest deployment observed: 100% `f6d80e8c-d9a0-4781-9141-038e1be58f24`, created 2026-09-04T22:58:33.028Z. Re-read at release time; do not roll back over a subsequent release.
- Public read-only checks: `/healthz` 200 `{ok:true}`, `/readyz` 200 `{ok:true}`, `/version` 200, configuration version `8.5.2-rc.1`. The configuration version is not proof of an exact Git commit.
- Production D1: `project-spawn`, `8fd44e8d-9ffc-4f9b-8c2c-f6ba1a9827aa`. Remote migration listing shows only `0025_operations_members.sql` and `0026_operations_review_locks.sql` pending.
- Staging owner publication and second-administrator rejection succeeded and appeared with their actual email identities in Activity. Browser form Origin regression was fixed. Email sign-in and MFA are configured; production login has not been tested.

## Release scope

Use the existing production Spawn Worker and database for the operations UI. Do not attach the staging Worker to production data or copy the staging database. Production owner is `phil.kolevski@gmail.com`; intended administrator is `barohez12@gmail.com`, subject to release approval and explicit production membership creation.

The two migrations add member/access-audit tables and review leases. They do not seed users, modify inventory, or activate monitoring. Never run `scripts/seed-operations-staging.sql` against production.

Retain existing domain, D1 binding, secret bindings, rate limits, version metadata, feature flags and the existing `5 * * * *` cron. No acquisition, verification, delivery or monitoring activation is included. Existing cron activity continues. Live review decisions can publish catalog/customer events or enroll monitoring according to the selected workflow; they must not be used as synthetic smoke tests.

## Access configuration to approve

Create a separate **Garfield Operations — Production** Access application with its own AUD. Never reuse the staging AUD. Use **public-hostname/path destinations**, not Worker-wide protection or `spawn.aztlan-eng.com/*`.

Protect these browser destinations on `spawn.aztlan-eng.com`:

| Paths | Purpose |
| --- | --- |
| `/ops` and `/ops/*` | Workspace, account, member management, activity |
| `/dashboard` and `/dashboard/*` | Diagnostics and review POSTs |
| `/approvals` | Review forms |
| `/inventory` and `/inventory.csv` | Operator inventory and export |

Confirm exact-path and descendant coverage in Cloudflare before releasing. Do not add `/` as a catch-all. The Worker independently requires a valid operations JWT on `/`; use `/ops` as the entry link.

Keep `/healthz`, `/readyz`, `/version`, `/internal/*`, `/admin/*`, `/run`, `/feedback/*`, `/weekly-feedback/*` and `/vendor-issue/*` outside this browser Access application. Their existing application authentication, signatures and rate limits remain authoritative. Inspect the final Access destination list for overlaps before saving. Do not introduce bypass policies to compensate for a whole-host rule.

Use a separate exact-email production Allow policy for the owner and approved administrator. Select only One-time PIN, enable instant authentication, require independent MFA (Biometrics or Authenticator application), keep six-hour application sessions and the currently tested 24-hour MFA verification duration. Preserve HTTP-only and binding cookies. No policy override disabling MFA. The App Launcher must permit those identities for enrollment without requiring initial MFA; its existing email-code login may be reused.

Add a production launcher bookmark pointing to `https://spawn.aztlan-eng.com/ops`, labeled **Open Garfield Admin — Production**, visible under the production policy. The bookmark does not replace the protected application. Keep staging visibly distinct.

## Deployment sequence after approval

1. Refresh remote Git state, deployment baseline and pending migrations. Stop if there is drift and review it. Merge the reviewed release through the repository's normal PR process; do not push directly to main. Record the resulting commit and exact artifacts.
2. Record a current D1 Time Travel recovery point through Cloudflare and confirm retention/restore availability. Keep recovery metadata in release records. A full database restore is not the routine rollback for this release.
3. Configure and inspect the production Access application and independent production policy above. This starts a maintenance window for browser routes; leave machine endpoints reachable. Record the production AUD and test that unauthenticated browser requests reach sign-in.
4. Generate the production configuration locally:

   ```powershell
   node scripts/prepare-operations-production.mjs ACTUAL_PRODUCTION_AUD
   ```

   The generator requires a 64-character AUD different from staging, validates the production Worker/database, refuses to overwrite an existing generated file, and makes no network calls. It copies `wrangler.jsonc` and adds only the five operations variables. Review it against the baseline; verify its AUD in Cloudflare. The generated file is ignored by Git and stays beside the base configuration to preserve relative source/migration paths.

5. Apply only the reviewed migrations as a distinct operation:

   ```powershell
   node node_modules/wrangler/bin/wrangler.js d1 migrations apply SPAWN_DB --remote --config wrangler.jsonc
   ```

   Confirm no other migration became pending. Never use `pnpm deploy`, which combines migration and deployment.
6. Build and deploy as separate commands:

   ```powershell
   pnpm run check
   node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config wrangler.ops-production.generated.jsonc
   node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.ops-production.generated.jsonc
   ```

   Use a full code cutover, not split traffic with the legacy authentication version. Review the Wrangler binding summary and resulting deployment version. Reconcile the five approved operations vars into the maintained production configuration before later routine deployments; otherwise a base-config deploy could silently restore legacy mode. Do not erase or rotate secrets as part of this step.
7. Owner signs in using an email code and MFA. Verify **Production · live data**, owner identity, queue, inventory, Activity and My account without making a listing decision. Through People & roles, create the approved production administrator with a production onboarding reason; this creates a new audited membership, not a copy of staging rows.
8. Administrator signs in independently, checks role `admin`, and opens queue/Activity. Confirm People & roles is forbidden even by direct URL. Do not give the administrator Cloudflare infrastructure membership.
9. Re-check machine health, authenticated Catch catalog/ingestion access using existing credential handling, latest scan state, and consumer acknowledgement. Never print secret values or trigger a manual scan merely to test UI release.

## Acceptance and stop conditions

- Old shared-token links and unsigned identity headers cannot bypass individual authentication on browser paths. Missing/invalid/wrong-audience JWTs fail closed; null/cross-origin writes and viewer mutations remain blocked.
- Health/readiness remain 200; internal APIs return their expected API responses rather than HTML sign-in redirects. Tests cover separation of browser and machine authentication; live authenticated consumer compatibility still needs release-time verification.
- `/inventory.csv` becomes an operator-session export. Existing bearer-only CSV automation would stop working. No reference was found in the local Catch repository; confirm any external consumers before cutover.
- User revocation is rechecked on every request. Staging demonstrated individual review attribution; production validation must not fabricate a live publication/rejection.
- Stop for unexpected pending migrations, changed production deployment, Access catch-all rules, missing production audience, failed health/readiness, API redirects, exposed legacy tokens, or incorrect identities/roles.
- The first live review is a separate, owner-supervised decision using actual evidence, after read-only acceptance. Customer registration remains outside this release.

## Rollback

If code fails, retain the production Access boundary and restore the recorded prior Worker version through Cloudflare's deployment rollback controls. Confirm the version immediately before rollback. Old UI may require its existing shared-token links while still behind email/MFA protection; `/ops` may be unavailable on the old version. Do not disable Access or expose the legacy UI publicly to recover convenience.

Leave the additive operations tables intact. Rollback does not reverse decisions, membership audit rows, catalog versions or externally delivered events. Pause further human decisions while investigating. Correct individual decisions through their existing audited workflows; a D1 restore requires separate approval because it can discard concurrent scans and unrelated changes.

If Access routing breaks machine clients, correct only the erroneous destination coverage while keeping admin routes protected. Verify health and authenticated machine access again. Do not rotate shared service credentials or change cron as a rollback shortcut.

## Execution status after Access preparation

Draft PR: https://github.com/kolevskipk-ux/project-spawn/pull/34. Production Access application 92b33fc7-3837-4443-924f-e0838e95f6de is saved with the seven browser destinations listed above. Independent policy db1ab743-b0df-4b36-9369-7adf64b2bbe2 includes only the owner and approved administrator. Email-only sign-in, six-hour sessions, independent biometrics/authenticator MFA (24-hour verification), HTTP-only and binding cookies are saved. The native production launcher tile uses the first domain, spawn.aztlan-eng.com/ops; a separate bookmark is unnecessary because this application has a public hostname. Post-login tile visibility remains user-verifiable.

Production AUD: 410a95e04192c50101ad87418fd2c9205619f345a9f066b487efa5f4f8475f99. Both the generated configuration and maintained wrangler.jsonc on the release branch contain the five operations vars; all existing settings are preserved. The generated config is already present locally, so do not run the overwrite-refusing generator again without deliberately archiving that file.

Verified unauthenticated GETs for /ops, /ops/account, /dashboard, a /dashboard/listing action path, /approvals, /inventory and /inventory.csv redirect to the expected Access host. /healthz, /readyz and /version remain 200; /internal/garfield/vendors and /admin/status remain API 401 responses without login redirects. This verifies routing, not authenticated consumer data access.

TypeScript and all 88 tests pass. A dry-run with the actual production audience passes. No production migration, production member row, code deployment, merge or live publication has been performed. The previous production code remains behind the new browser Access boundary and may still require legacy shared links until cutover. The remaining approval is to merge the release, record the recovery point, apply the two migrations, deploy the reviewed configuration and grant the production administrator through the audited workflow, as separate operations. It does not authorize training data or live listing decisions.
