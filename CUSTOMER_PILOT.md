# Customer dashboard staging pilot

## Current behavior

Customer URL: https://customers-staging.aztlan-eng.com/
Customer management: https://garfield-operations-staging.phil-kolevski.workers.dev/ops/customers

Open email-code registration creates a read-only customer account, with no
Cloudflare account or invitation required. The dashboard supports search,
set/store/availability filters, pagination, account details and personal watermarks.
There are no customer CSV/PDF exports or admin/machine routes. Discord is deferred.

The customer site now reads approved listings from the **operations staging**
database through a private projection Worker. These are synthetic fixtures, not
production offers. Source changes are visible on the next request; no scheduled
sync, export file or stale snapshot fallback is used. The original local sample
catalog remains available for isolated tests but is not selected by staging config.

## Publication and freshness boundary

`src/customer-feed.ts` selects only explicit customer fields. Listings must have
an accepted candidate with publication timestamp and latest PUBLISHED decision,
or an approved PUBLISHED Amazon catalog entry. Archived inventory, suspended or
rejected Amazon targets, suppressed candidate vendors, unconfirmed cross-border
fulfilment and expired destination evidence are excluded.

Prices require a verified timestamp or a successful HTTP-200 retailer revalidation
with an observed price. Availability requires a trustworthy monitoring or
revalidation timestamp and an eligible lifecycle state. Observations older than
24 hours or dated in the future become unconfirmed; stale prices become null.
Publication alone is never evidence of current stock or price. A source failure
returns an unavailable page instead of exposing old snapshots or raw inventory.

The source Worker has no public routes, workers.dev URL, preview URL, cron, write
API or secrets. Only the customer's service binding calls its paginated projection.
It holds the staging source D1 binding; the public customer Worker does not.

## Customer access management

Administrators and the owner can search customer accounts by email or watermark
ID, pause access, and restore access through `/ops/customers`. Viewers and customer
JWTs cannot use this page. Reasons are required. Every status change records the
actor, timestamp, reason and customer ID through a database trigger in the same
transaction as the update. Versioned forms reject stale changes.

A paused account is denied on its next request, including an existing session.
Registration cannot reactivate it. These controls never modify staff roles.
Customer management is present only where the optional CUSTOMER_DB binding exists;
production operations does not yet have that binding.

JWT validation checks RS256 signature, issuer, distinct audience, expiry,
issued-at, subject and email. Unsigned email headers and old shared links grant
no access. Registration and management require same-origin forms. Customer HTML
uses escaping, no-store, a restrictive CSP and a per-email 120-request/minute limit.
The watermark uses an account UUID prefix and UTC date; it is an attribution aid,
not DRM. Normal websites cannot reliably prevent screenshots, copying or printing.

## Current deployment record — 2026-09-05

| Component | Worker / version |
| --- | --- |
| Customer website | garfield-customer-staging / 233a36ab-5367-4d8d-908a-10a7cad63e08 |
| Private feed | garfield-customer-source-staging / e2fcb536-9624-4079-a7f7-d2e7b0207475 |
| Admin staging | garfield-operations-staging / 77aa2cf1-4104-472b-9cd7-ffb5c4cd17db |

Configs: wrangler.customer-staging.jsonc, wrangler.customer-source-staging.jsonc,
wrangler.ops-staging.jsonc. Customer D1: garfield-customer-staging,
b0ccf310-2ac6-4e2f-9744-0df98e35193f. Source D1: garfield-operations-staging,
9f16bc45-22bc-48ef-a186-a6ae092524e0.

Customer migrations 0001 and 0002 were applied separately from Worker deployments.
The source fixtures in scripts/seed-customer-source-staging.sql were applied only
to operations staging. All staging cron lists remain empty. Do not run sample
scripts against production or change source/management bindings across environments.

Access application: Garfield Customers — Staging,
0945e330-c0ff-4c36-8d27-038b5f1b7eb4; paths `/app` and `/app/*` on the customer host.
Policy: Garfield customer email registration — Staging,
3fe5cf2b-737d-468b-a065-6db19c29ff16; Allow Login Methods: One-time PIN.
OTP-only, instant authentication, six-hour session, HTTP-only and binding cookies.
MFA inherits global off; existing admin MFA and email restrictions are unchanged.

## Validation and launch status

`pnpm run check`: TypeScript and **103 tests across 17 files passed**. Tests cover
registration, identity and role isolation, publication and withdrawal, immediate
price changes, independent retailer price evidence, stale/future observations,
archival and shipping eligibility, source failure, access revocation/restoration,
audit attribution, stale management forms, CSRF, escaping, filters and export denial.

Philip completed the real email-code registration and initial filter exercise.
After the source connection, a browser reload showed the current source observation
timestamp and correct combined filter result. The authenticated admin Customers
page rendered with the existing account and pause control. Live customer access
was not changed during verification; pause/restore was exercised in integration tests.

A read-only production preflight using the final projection returned 55 eligible
listings, zero current verified prices and zero currently observed available
listings. This is an as-of check, not a permanent count. It changed zero rows and
did not connect or expose production data to the customer site.

Before live launch: obtain fresh independent production observations; review
unconfirmed prices/stock; configure a dedicated production customer database,
private source binding, sign-in audience and correct live-data wording; provide
customer support/privacy and account-removal handling; then run real mobile
registration and revocation checks. Migration, deployment and public activation
remain separate steps. Main merges trigger the existing production build, so do
not merge as a substitute for an explicit customer production release decision.
