# Customer dashboard pilot

## Scope and release boundary

The pilot is live at https://customers-staging.aztlan-eng.com/.
It provides open email-code registration, an explicit account-creation step,
read-only published sample inventory, search and set/store/availability filters,
pagination, an account page, and individual on-screen watermarks. There are no
CSV, PDF, JSON export, administration, machine-consumer, or inventory-write routes.
Discord integration is deferred.

This is an isolated staging trial, **not a production customer launch**. The four
visible listings are synthetic and explicitly labelled. A fifth pending listing
tests publication isolation. There is no connection to production inventory or
operations membership. `src/customer.ts` is a separate Worker entry point; it
never invokes `src/index.ts` or the operator routes. Default production deployment
still uses the existing entry point. Do not merge solely to deploy this pilot:
merges to main trigger the existing production build integration.

## Deployment record — 2026-09-05

- Worker: `garfield-customer-staging`
- Version: `99b17e32-24e3-4d59-a09c-5333a20a33ca`
- Config: `wrangler.customer-staging.jsonc`
- D1: `garfield-customer-staging` / `b0ccf310-2ac6-4e2f-9744-0df98e35193f`
- Migration: `customer-migrations/0001_customer_pilot.sql`, applied separately
  before deployment. Seed: `scripts/seed-customer-staging.sql`.
- No cron triggers, production data bindings, service bindings, or machine secrets.
- Workers.dev and preview URLs disabled; dedicated staging custom domain.
- Access application: `Garfield Customers — Staging`,
  `0945e330-c0ff-4c36-8d27-038b5f1b7eb4`.
- Access destinations: `customers-staging.aztlan-eng.com/app` and `/app/*`.
  The public landing page is outside this boundary.
- Policy: `Garfield customer email registration — Staging`,
  `3fe5cf2b-737d-468b-a065-6db19c29ff16`; Allow, Include Login Methods: One-time PIN.
- One-time PIN is the sole accepted identity provider; instant authentication on.
  No Cloudflare account membership or invitation is required.
- Six-hour session, HTTP-only and binding cookies enabled. MFA inherits the
  current global enforcement setting (off); admin-specific MFA policies unchanged.
- The distinct customer JWT audience is stored as a non-secret in the config.

## Application controls

The Worker verifies RS256 signature, issuer, customer audience, expiry, issued-at,
subject and email. It ignores unsigned email headers and shared tokens. Missing
configuration or an unverifiable JWT fails closed. Account creation uses only
the signed email and requires a same-origin form POST. It does not create or
modify `ops_members`.

Membership is read on each request. REVOKED accounts remain revoked after login
or repeated registration. A verified email has one account and a random UUID.
The watermark uses the first 12 UUID characters plus the UTC date; the full UUID
appears on My account and the inventory footer. The watermark is a deterrent and
attribution aid, not DRM: screenshots, browser printing, copying and extraction
cannot be reliably prevented by a normal website. Print styling retains it.

Queries select only explicit customer columns with publication state PUBLISHED.
Filters use bound SQL parameters, rendered values are HTML-escaped, pages have
no-store headers and a restrictive CSP. Results are capped at 24 per page. A
per-verified-email counter allows 120 requests per minute; it is not a full
anti-scraping system. No bulk feed or raw discovery/operator data is bound here.

Stored customer data: verified email, UUID, account status and creation date,
plus the current minute request counter. The registration page explains this.
Account revocation/removal currently requires an operator's targeted D1 action;
there is no customer-management UI yet. Never include email data or auth tokens
in deployment logs or public diagnostic output.

## Validation

`pnpm run check`: TypeScript passed and **95 tests passed** in 16 files.
Seven new customer tests use real SQLite and signed JWTs to cover registration,
wrong audience/issuer/expiry, unsigned identities, CSRF, duplicate and revoked
accounts, publication filtering/withdrawal, SQL injection, HTML escaping,
per-user watermarks, blocked admin/export routes, rate limits and generic errors.

Live unauthenticated checks: `/` 200; `/app` and `/app/account` redirect to Access;
`/ops` and `/inventory.csv` 404. `/app/export.pdf` is gated by Access and the
Worker rejects it after authentication (covered by tests).
The deployed welcome page rendered in the browser. **Live email delivery and a
real customer registration remain for Philip to test**; automated tests do not
prove these external-service steps.

## First customer test

1. Open the staging home page in Safari or another browser.
2. Choose Get dashboard access, use an email address and enter its email code.
3. Choose Create account & view inventory.
4. Confirm four sample listings, then filter by Demo Cards and observed available:
   only Sample Elite Trainer Box should remain.
5. Check the personal watermark and My account. There should be no download link.
6. Try `/ops` and `/inventory.csv` on the customer host: both must be unavailable.

Before production, connect an explicitly approved customer publication feed with
withdrawal and freshness propagation, add operator customer management and a
usable support/privacy workflow, assess authentication capacity and abuse limits,
and run real mobile registration/revocation checks. Revisit watermark legibility
with the customer's screenshot. Production migration/deployment/activation remain
separate decisions; do not copy sample data into production.
