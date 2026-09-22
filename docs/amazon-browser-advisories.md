# Amazon browser customer advisories

Authorized by Philip on September 21, 2026 after confirming Saved to Spawn receipts.

The installed v0.3.0 desktop and laptop extensions work without an update. Spawn
accepts their existing scoped receipts; Catch claims advisories once a minute using
its existing authenticated channel and posts to the existing 30th-anniversary hunt
webhook. Message: Buying options shown — click to see offers. Stock, price and
seller are unverified. No everyone mention or paid page acquisition is involved.

Eligibility: one of the 14 extension ASINs, currently PUBLISHED in the 30th catalog,
latest observation explicitly says the Buying Options control is shown, observation
at most ten minutes old, and Catch's authoritative product is not silent/removed.
Catch honors customer/vendor suppression, validation windows, and its existing
02:05–06:05 Mexico City quiet hours. Five-minute extension sweeps require Edge and
the computer to remain awake. Customer delivery normally follows within one minute.

Spawn stores a global per-ASIN episode and a separate durable advisory outbox
(migration 0047). Repeated positives from either device do not queue another alert.
Only an explicit absence rearms an episode; blocked/unknown checks do not. A new
episode also requires a 60-minute cooldown. Observations missed between polls may
conservatively suppress an episode. No inventory or normal restock baseline changes.

Claims lease for two minutes; failures retry while the original evidence remains
fresh. Catch stores delivery receipts for 30 days before acknowledging Spawn, so a
lost acknowledgement normally does not repost. This is not an exactly-once promise:
a process failure between Discord accepting a message and receipt storage, or an
ambiguous network timeout, can cause a duplicate. No retrospective stale alerts.

Both Workers gate this path with AMAZON_BROWSER_ADVISORIES_ENABLED=true. Disable
Catch's flag to stop customer delivery; disable Spawn's to stop claims. Existing
intake continues. Roll back code without dropping the additive tables or resetting
monitoring baselines. Pre-release versions: Spawn edf1a780-b1ef-4e57-a893-8360599eaef0;
Catch b42e88dc-4534-499d-b128-c0419643a00a.

Release order: apply migration 0047; deploy Spawn with feature disabled; deploy
Catch with feature disabled; activate each flag separately. Existing cron schedules,
paid search pauses and browser budget limits are preserved. Catch /status.json
exposes browserAdvisories.enabled and lastDelivery. Empty successful polls establish
the live authenticated path but do not prove a real advisory reached Discord.

Validation: Spawn 323 tests across 40 suites plus TypeScript; Catch full regression
suite plus advisory validation, channel routing, suppression, failed-send retry and
lost-ack deduplication tests. No synthetic product alerts are sent to customers.
