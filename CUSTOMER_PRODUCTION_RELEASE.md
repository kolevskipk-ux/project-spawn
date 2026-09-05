# Customer production release preparation — 2026-09-05

The customer pilot is prepared for a separate production site at
`https://customers.aztlan-eng.com`. Public activation is pending the release review
and support webhook connection. No production customer Worker has been deployed
by this preparation step. A main merge deploys the operations Worker through the
existing build; it does not deploy either of the separate customer Workers.

## Completed infrastructure

- Production customer D1: `garfield-customers-production`,
  `a7730486-5f12-4d22-ad81-f4cfd1c917d3`. Customer migrations 0001–0003 applied.
  No staging accounts or sample inventory copied.
- Access application: Garfield Customers — Production,
  `a88e4864-505c-4e96-a0f6-eb4d9624418d`. Protects only
  `customers.aztlan-eng.com/app` and `/app/*`.
- Policy: Garfield customer email registration — Production,
  `28b562de-60fe-4f5e-9f50-5484598ab5fd`. Allow Login Methods: One-time PIN.
  Email-code provider only, instant authentication, six-hour application session,
  HTTP-only and binding cookies. No Cloudflare account required.
- `wrangler.customer-production.jsonc` uses its own audience and customer database.
  `wrangler.customer-source-production.jsonc` binds the existing production source
  database privately; no routes, workers.dev, preview URLs, or cron.
- The operations config adds the production customer DB for account management
  and support. Existing monitoring flags, admin identity policy and cron remain
  unchanged.

## One-time evidence refresh

The approved refresh collected 55 eligible non-Catch retailer product pages once,
without bypassing blocks or enabling scheduled revalidation. Strict JSON-LD
Product matching requires the canonical URL and title/SKU identity, an attributable
offer, explicit availability, and MXN currency for a confirmed price. Ambiguous
offers and page-wide promotional prices are not used.

Collection run: `2026-09-05T21-10-21-895Z`. Apply completed
`2026-09-05T21:14:14.772Z`. A subsequent query through the exact customer projection
returned 55 eligible listings, 12 confirmed prices, 8 available and 4 sold out.
Other observations: 41 unknown, 1 error, 1 blocked. These are as-of counts;
confirmed observations automatically become unconfirmed after 24 hours.

The writer stores attempts and evidence hashes, rejects expired evidence, checks
the current publication scope and source snapshot, and avoids replaying newer
observations. It does not change publication decisions, enroll Catch monitoring,
or emit customer/Discord inventory events. Local HTML, report, receipt and recovery
bookmark are under `artifacts/customer-refresh-2026-09-05T21-10-21-895Z/` and are not
committed. Do not restore the entire database merely to reverse this refresh;
later legitimate writes must be preserved.

## Support delivery

`/app/support` accepts signed-in customer requests, including paused accounts.
Requests are persisted before Discord delivery, limited to five per account/hour,
and protected by same-origin form checks. Account-removal requests require manual
team review. `/privacy` describes stored account/support data and watermark limits.

`/ops/customer-support` gives owners/admins a queue and delivery retry action.
Viewers and customers cannot access it. Discord receives request type, message,
request ID and customer ID, without the account email. Mention parsing is disabled.
The admin queue can resolve the customer ID to the email. Delivery claims prevent
concurrent sends; uncertain network outcomes can still duplicate a retry, so use
the request ID to recognize duplicates. There is no automatic delivery cron.

Required secret: `CUSTOMER_SUPPORT_WEBHOOK_URL`, a webhook for **SUPPORT_SPAWN**.
Configure it as a Cloudflare secret on the customer Worker and corresponding
operations Worker. Never put it in vars, the repository, screenshots, logs or chat.
No existing inventory webhook is reused. Secret connection and real Discord
delivery are pending; missing secrets leave requests saved as failed delivery.

Staging migration 0003 applied. Browser verification saved request
`7192a66b-8c50-4c42-8f34-bd70a01d2b2a` and confirmed it appeared in the admin queue
with a safe missing-channel error. No account removal or Discord send occurred.

## Validation and release sequence

TypeScript and 112 tests across 20 files passed, including durable delivery,
quota/concurrency, failed-send retry, secret redaction, paused-customer support,
admin/viewer boundaries, CSRF, escaping, inventory isolation and refresh writes.

1. Finish webhook connection and verify a clearly labeled support test with Philip.
2. Review/merge this branch. The production customer schema is already prepared
   for the operations deployment; verify the customer/support admin pages after it.
3. Deploy the private source separately:
   `node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.customer-source-production.jsonc`.
4. Deploy the customer Worker separately:
   `node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.customer-production.jsonc`.
5. Set its support secret securely. Check public landing/privacy, signed-out
   `/app` and nested-path redirects, real mobile email registration, inventory
   filters/watermark, a support submission and its Discord receipt. Verify pause
   enforcement with an explicitly designated test account.
6. Recheck freshness before sharing the customer link. Scheduled refresh remains
   off; any later refresh or cron activation is a separate action.

For rollback, roll back Worker versions independently and keep the additive
customer database/migrations. Keep authentication protection in place. Do not
delete customer accounts or rebind production to staging as a rollback shortcut.
