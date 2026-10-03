# Scout health notifications

Deployed and activated October 3, 2026. Active Worker version: 6998e7c3-8033-422c-94ae-5e369e5118d2. Health and readiness returned 200; heartbeat rejects unauthenticated requests with 401. First scheduled sample recorded at 18:35:02 UTC; all 16 products stale, inside the initial five-minute grace period. Edge 0.5.8 reload and heartbeat receipt remain pending.

Spawn's existing minute cron independently monitors published Scout products. Fresh successful readings (sold out, buying options shown, or a validated offer) must be at most five minutes old for the four hot products and fifteen minutes for others. These are page-coverage measurements, never proof of stock. Errors, unknown and blocked observations do not refresh coverage.

One Ops alert opens an incident. Unchanged or improved-but-incomplete coverage remains silent; worsening from partial coverage to stopped or fully stale coverage can escalate. Full fresh coverage across two distinct minute samples sends one recovery notice. A second collector with fresh coverage can prevent an unnecessary outage alert. Alert delivery failures are retried; D1 leases serialize monitor runs. No customer destinations or mentions are used.

Edge Scout 0.5.8 reports status each minute and when relevant state changes. Authentication assigns collector identity; the client cannot choose it. Intentional manual pause suppression expires two hours after its reported transition and cannot be renewed by heartbeat polling. Reload is not an intentional pause. Legacy collectors still contribute page readings without heartbeats. Automatic read-failure stops and repeated challenges are included when no healthy reported collector covers them.

Uses existing worker_state and scan_locks tables; no migration. Queries are bounded to the latest fifteen minutes through the existing per-ASIN observation index. New monitor flag SCOUT_HEALTH_ALERTS_ENABLED remains off unless explicitly activated.

Release: deploy Spawn code with variables retained, separately activate SCOUT_HEALTH_ALERTS_ENABLED=true, then reload Edge Scout 0.5.8. Existing cron expressions stay unchanged. Verify heartbeat receipt, fresh coverage, notification queue behavior and live Ops acknowledgement without fabricating offers. Rollback by disabling the flag; existing monitoring and product alert delivery continue. A transient failed Discord acknowledgement can still cause a duplicate retry, as with other webhook deliveries.
