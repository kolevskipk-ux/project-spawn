# Bounded inventory observation — September 27

Authorized by Philip: reactivate inventory management queries, observe for 2–3
days, keep retirement draft-only and adjust based on results.

This stage resumes existing-listing revalidation only. Catalog crawling remains
paused, as does unrestricted revalidation. The separate observation runner uses
the existing hourly :05 cron; no cron or schema changes are required.

Start 2026-09-27T19:30:00Z; expiry 2026-09-30T19:30:00Z, equivalent to
September 27–30, 13:30 Mexico City. First scheduled work September 27 14:05 local.
At most 72 runs, five due listings per run (360 attempted checks maximum).
Domain backoff, watchlist exclusions and existing verification policies remain.
This is a small sample, not complete inventory coverage or proven catalog cost.

Worker-side limits: 1,000,000 metered reads and 10,000 writes per start-relative
24-hour period, at most 3,000,000 reads/30,000 writes overall. A limit or execution
error stops the entire observation, without automatic next-day resumption.
The expiry works with the desktop offline. Claims deduplicate concurrent runs;
a crash leaves running state and prevents further work pending operator review.
D1 meters after execution: a statement or batch can overshoot the threshold;
small indexed observation-control queries are outside these totals. These are
workload limits, not a hard account-wide billing cap.

worker_state key: inventory_observation:2026-09-27T19:30:00Z. Contains runs,
total and period reads/writes, and up to 72 hourly samples with attempted counts
and AVAILABLE/SOLD_OUT/UNKNOWN/BLOCKED/ERROR outcome counts. A failed run may
have partial work; its attempted count is not a guarantee that no fetch occurred.

Cost watch: inspect the indexed key and total hourly analytics. Investigate total
project-spawn reads above 4.03 million/hour (100 million/day planning target),
read/write stops, or persistent monitoring/runner failures. Keep separate original
$5/day severe-cost trigger. Do not treat low reads with no useful observations
as success. Send a 48-hour assessment and final 72-hour/early-stop result through
the already authorized production Discord ops route; otherwise stay quiet unless
action is needed. Monitor needs the desktop awake; runtime budget/expiry does not.
Current account allowance is not verified; no broader restart is authorized.

Review after the observation: useful verification rate, outcomes by day, cost per
attempt and per trustworthy observation, available coverage and stale backlog.
Retirement rules in inventory-retirement-draft.md remain unimplemented.

Rollback: remove INVENTORY_OBSERVATION_START or restore the prior deployment.
Preserve all evidence; do not reset baselines or retry a stopped campaign.
