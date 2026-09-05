# Production release verification — 2026-09-05

PR #34 merged as `463c75c`. Its Git tree matches the reviewed branch head `142f173`.

At verification, Cloudflare had already applied migrations 0025 and 0026 at 17:37:35 UTC and deployed Worker version `8aeab6b3-e8d4-4e47-8262-7546fbe89672` at 17:37:38 UTC (100% traffic). This is consistent with the merge triggering the existing Cloudflare build/deploy integration. No duplicate migration or deployment was run by this verification task.

The automatic release behavior was missed during preparation. Before another release, inspect the Cloudflare build/deploy command and revise the process so its combined migration/deploy behavior cannot contradict a proposed separate-step approval sequence. Do not assume merging only changes source. No build configuration was changed during this verification.

The observed live version has the production database binding, Access mode, production audience, owner email, Production · live data label and preserved operational feature flags. Secret names were inspected; no secret values were read or changed.

Recorded D1 recovery bookmark `00000b62-0000000e-000050dd-5c7548e4f61f1b83d0e05cd9d7e9e098` was obtained AFTER the automatic migrations/deployment, not before them. Do not describe it as a pre-release backup. Prior Worker version: `f6d80e8c-d9a0-4781-9141-038e1be58f24`.

Read-only checks passed: health, readiness and version return 200; admin pages and inventory export redirect unauthenticated users to the expected Access host; internal vendors and admin status return API 401 without sign-in redirects. The two synthetic staging candidate IDs are absent from production. Latest recorded discovery scan before cutover succeeded at 15:06 UTC; this does not prove a post-release scheduled scan has run.

Production ops_members was empty at verification. Owner login, audited grant for barohez12@gmail.com, authenticated live page checks, administrator login and authenticated downstream consumer checks remain pending. A fresh owner email-code/MFA session has been requested. No live listing decisions or sample-data imports were performed.

## Owner and membership verification

Owner completed production email/MFA sign-in and granted barohez12@gmail.com ACTIVE admin access at 2026-09-05T17:43:51.291Z. Verified the production People & roles entry and Activity row attributed to phil.kolevski@gmail.com with reason Admin support. No duplicate grant was performed. Read-only browser checks confirmed production Overview, Approvals, Inventory and My account render successfully; My account reports the correct owner identity. A large approvals snapshot timed out, then a bounded DOM heading check confirmed the page loaded normally.

The remaining human acceptance step is the second administrator signing in to production and verifying their admin identity and read-only access to the queue. Do not reuse synthetic review exercises in production. Authenticated downstream consumer verification and a post-release scheduled run remain separately unconfirmed.
