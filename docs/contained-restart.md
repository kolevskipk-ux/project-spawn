# Contained revalidation restart — September 26

Philip authorized deployment to assess whether resumed work fits the included
D1 allowance. This starts only inventory revalidation, not catalog crawling.
Normal revalidation and both catalog flags remain false.

Window: September 26 23:20 UTC through September 27 05:20 UTC (17:20–23:20
Mexico City September 26). Existing hourly :05 schedule performs at most one
listing per hour, six invocations total. Automatic expiry needs no desktop.
Atomic worker_state claims prevent duplicate hours. A crash, error or missing
metering stops this experiment; it cannot automatically retry or restart.

D1 statement and batch result metadata measure trial reads/writes. The cumulative
read stop threshold is 250,000, excluding small indexed trial-control operations.
A statement/batch already executed may exceed the threshold before it is known:
this is a circuit breaker, not a hard Cloudflare billing cap. No further trial
work runs after a recorded stop. Normal workload costs remain separate.

Evidence key: revalidation_trial:2026-09-26T23:20:00Z in worker_state, including
runs, reads, writes, hour, status and most recent result. A state left running
means interrupted work and needs investigation; do not reset it to retry.
No migration or cron change. Existing revalidation evidence and event rules apply.

Cloudflare Workers Paid includes 25 billion D1 rows read and 50 million written
per month across the account. Use a conservative 31-day planning target of
20 billion reads/month (~26.9 million/hour), leaving 5 billion headroom. This
does not establish remaining account allowance. Full account billing must be
checked before broader resumption; CPU, requests, storage and browser costs are
separate. A six-listing trial cannot validate full catalog cost or coverage.

Read total hourly analytics alongside the trial state. Notify on trial stop,
completion, or projected residual+trial reads above 26.9 million/hour, preserving
the existing $5/day emergency investigation threshold too. Low usage with zero
attempted listings is inconclusive. Do not expand or restart automatically.

Rollback: remove the trial start variable or restore Worker
46250fff-ef9f-4dad-8529-1dafd109b1d9. Leave saved evidence intact.
