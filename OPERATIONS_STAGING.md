# Garfield operations website

The private operations website extends Spawn's existing approval and inventory routes. It runs in a separate staging Worker and D1 database with no production secrets, cron, retailer acquisition credentials, Catch connection, or customer delivery bindings.

## Staging

- Configuration: `wrangler.ops-staging.jsonc`
- Worker: `garfield-operations-staging`
- URL: https://garfield-operations-staging.phil-kolevski.workers.dev/ops
- Owner: `phil.kolevski@gmail.com`
- Database: `garfield-operations-staging`
- Migrations: existing schema plus `0025_operations_members.sql` and `0026_operations_review_locks.sql`

Cloudflare Zero Trust Free was activated by the owner on 2026-09-05. The Access application `Garfield Operations — Staging` (`f81095d5-bdf9-432a-b2a4-67243a104c3d`) protects the staging Worker's production and preview URLs. Its only allow policy is `Garfield staging owner`, restricted to the configured owner email. Application sessions last six hours. `OPS_ACCESS_ISSUER` and `OPS_ACCESS_AUD` are saved in the staging configuration and deployed.

The current login method is the Cloudflare identity provider. The owner temporarily disabled application-specific MFA for the isolated synthetic-data pilot on 2026-09-05; the setting was verified in Cloudflare. Owner sign-in and the dashboard and approvals pages were then confirmed working by the owner. Restore MFA and verify enrollment before adding another administrator or connecting live data. Global MFA enrollment methods remain biometrics and an authenticator application; global enforcement remains off. HTTP-only cookies and binding cookies are enabled.

Additional members must be permitted by both Access and the application's People & roles screen. Granting membership does not send invitations or alter Cloudflare policies. A future login-provider change must preserve MFA and verified identity validation.

The App Launcher is enabled with the same owner-only policy and a six-hour session so personal MFA enrollment can work. The direct enrollment URL is https://hidden-shadow-9100.cloudflareaccess.com/AddMfaDevice. The owner can choose Windows Hello biometrics or an authenticator application there. Enrollment is a user-operated credential setup; never collect its secret or recovery codes. Future invited administrators also need App Launcher access to enroll MFA.

The owner identity is configured by the operator, and cannot be modified or revoked in the member form. Member roles are `admin` and `viewer`; membership is checked on every request. Access JWT signatures, issuer, audience, subject, email, expiration and token age are validated using `jose`. The unsigned email header and old board token cannot authorize protected routes in Access mode. Browser writes require same-origin form submission and a writable role. Existing machine interfaces retain their separate bearer/HMAC authentication and require a nonempty credential.

## Pages

- `/ops`: review backlog, inventory total and recent scan outcomes.
- `/approvals`: existing evidence-bound listing, campaign and Amazon decisions, within shared navigation.
- `/inventory`: existing inventory filters and observations.
- `/ops/activity`: latest 100 review, pricing, campaign and access decisions.
- `/ops/people`: owner-only membership changes and revocation.
- `/ops/account`: verified identity, role and sign-out.
- `/ops/vendors`: read-only vendor registry.
- `/ops/health`: scan outcomes and entry to protected detailed diagnostics.

Approval forms retain existing verification and publication policies. Decisions use the verified operator email. A five-minute per-route lease prevents simultaneous browser actions on the same review; expired leases can be reclaimed. Amazon actions also compare the rendered lifecycle state, alongside existing evidence revision checks. This does not replace the existing review service's database consistency requirements for automation or machine callers. Unknown fulfilment is no longer preselected as domestic delivery in the review form.

## Validation and release

Run `pnpm run check` with Node 24 (the schema integration tests use `node:sqlite`). The integration suite applies all migrations to a fresh in-memory database, renders every page, onboards a second administrator, records their review, revokes access and checks simultaneous decisions.

Build: `node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config wrangler.ops-staging.jsonc`.

Keep these operations separate:

1. Apply staging migrations: `node node_modules/wrangler/bin/wrangler.js d1 migrations apply SPAWN_DB --remote --config wrangler.ops-staging.jsonc`.
2. Deploy staging code: `node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.ops-staging.jsonc`.
3. Configure Access, then verify owner sign-in and a second person's real sign-in before declaring the pilot complete.

Verify denied access on `/ops`, `/dashboard`, `/approvals`, `/inventory`, `/inventory.csv` and direct action URLs, including forged identity headers and old links. Test viewer POST denial, stale review rejection, logout, missing membership and immediate revocation. Do not add a development authentication bypass to the hosted Worker.

No production migration, deployment, domain change or activation is included. Production rollout needs the existing repository release approval after the staging pilot. Code rollback is a Worker version rollback or source revert; additive account tables remain in place. Never disable Access mode as a recovery shortcut; preserve the fail-closed boundary.

## Remaining pilot setup

Complete the sample approval exercise. A native form submission exposed a conflict between the inherited no-referrer response policy and strict Origin validation. Individual-access pages now use same-origin referrer policy, preserving the Origin needed for form POSTs while withholding referrers from external sites. Legacy shared-token pages retain no-referrer. Null, missing, and cross-origin writes remain blocked. TypeScript and all 84 tests passed; the owner subsequently completed a sample publication and confirmed both Inventory and Activity.

Restore owner MFA and verify enrollment before adding a second person's email when provided, then complete a real two-person staging review. Connect production data only through a separately approved production release.

Approval form follow-up: international evidence fields are explicitly required before native form submission; optional shipping/import fields are labeled, dates are explicitly UTC, missing evidence receives field-specific server errors, and success notices omit internal IDs. TypeScript and all 87 tests passed. Staging deployment: 924ad4cc-bdb0-4ab2-8470-960df2ef99d3.
