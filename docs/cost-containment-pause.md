# Cost containment pause — September 19, 2026

Philip authorized pausing catalog crawling and inventory revalidation to reduce
out-of-pocket costs before the next billing cycle. He subsequently said queries
can resume once the next allowance is available. No automatic restart is scheduled.
The dashboard shows the next renewal on September 22, not October.

Source: 20d5aa9. Production version: b6f0fd68-e3f8-4215-83a4-c65223b12334.
Previous version: f83322a8-ad1c-41c3-8986-4cb038a6b1a3.

Verified deployed plain-text bindings:
- STORE_CATALOG_SYNC_ENABLED=false
- STORE_CATALOG_FAST_ENABLED=false
- INVENTORY_REVALIDATION_ENABLED=false

The first two disable scheduled catalog work, and the third returns before
revalidation database work. Existing inventory, queue records and baselines are
preserved. No schema changes, browser-budget changes or cron changes were made.
Explicit operator catalog actions are not globally disabled. Website requests,
other store monitoring, hourly discovery, approvals and delivery work remain
enabled; this is reduced exposure, not a zero-cost shutdown.

Deployment verification confirmed all three flags false and /readyz healthy.
The last catalog tick at the first post-pause read was 2026-09-19T23:59:41.868Z.
The cost watch remains active every 30 minutes with production Discord ops
delivery, while the desktop is awake and Codex is running. Its prompt was updated
to expect the pause and never claim lower costs demonstrate normal-load repair
success. It must not automatically resume jobs on allowance renewal.

Before resumption: agree a workload budget and measured trial, then deliberately
enable the reviewed flags and measure fresh read rates. Existing charges are not
refunded by a pause or allowance reset. Historical billing totals may still rise
as earlier usage is processed.
