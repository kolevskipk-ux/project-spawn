# Scout server state

Reviewed October 19, 2026. See the [functionality map](../GARFIELD_FUNCTIONALITY.md)
for coordinated ownership and [server history](scout-marketplace-server.md) for
dated activation/repair records. Scout is a browser collector hosted on Linux,
not a separate Cloudflare Worker or a discovery/approval service.

## Deployed and enabled

- `scout-amazon.service`: Firefox extension 0.5.9; sixteen fixed approved ASINs.
  Four hot products target four minutes; others twelve minutes, with positive
  jitter up to fifteen seconds and at most six due products per tick. Reads serial.
- `scout-marketplace.service`: extension 0.4.4; two Walmart and five Mercado Libre
  identities, thirty-minute schedules staggered by two minutes. Saved-tab recovery
  validates identity, and observer dashboards initialize once per browser session.
- `scout-watchdog.timer`: checks every two minutes. Restart an already-active
  Amazon service only when progress is stale twenty minutes and its next run is
  overdue ten minutes; cap one/hour and two/day. Preserve pauses, challenges,
  cooldowns, breaks and missing-evidence/inactive-service protections.
- Marketplace quiet hours: 02:05–06:05 America/Mexico_City. Amazon has no default
  acquisition night break. Health notification deferral 21:30–06:00 and 07:00
  overnight summaries are separate from acquisition schedules.

## Continuation and offer evidence

Version 0.5.7 ports the local Edge continuation flow with stricter Catch guards:
recognize an ordinary shopping gate, allow same-origin redirects to classification,
click once and reread. Require the expected message, visible enabled submit
control, same-origin GET validation action and no robot/CAPTCHA/sign-in evidence.
Preserve URL/DOM ASIN, title and seller validation. An unresolved gate or genuine
challenge retains backoff; `validateCaptcha` in a form name alone is not proof of
a genuine CAPTCHA. Do not solve CAPTCHA or account verification automatically.

Inconclusive other-seller offers remain unknown without counting as failed page
reads. Paused/unavailable marketplace listings do not certify seller inventory.
Stock, page freshness and accepted delivery receipts remain separate facts.

## Homepage redirect recovery 0.5.9

Installed October 20 at 15:25 UTC after explicit authorization. Overnight,
UPC Night and Umbreon Battle Deck retained tabs redirected to the Amazon root
homepage; repeated identity failures kept them stale while the other fourteen
continued. A positively recognized Amazon México homepage now permits one
canonical navigation to the configured ASIN, inside the existing product deadline.
Challenge/shopping-gate classification precedes recovery, and the destination
must still pass the existing identity, seller and challenge checks. Persistent
redirects remain unknown without looping. No cooldown or pause is cleared.

Fifteen offline homepage cases, fifteen continuation/CAPTCHA guard cases and
sixteen failure/tab isolation cases passed. Only extract.js, read-tab.js and
manifest.json changed; background, read-health, product check/tab, pacing,
schedule and challenge recovery hashes were verified unchanged. Credentials,
profiles and watchdog remain intact. Build with
`scripts/patch-scout-homepage-recovery.mjs <public-0.5.8-package> <output-folder>`.

At October 20 15:31:55 UTC (09:31 Mexico City), all sixteen server products had
fresh accepted readings, with monitoring enabled and no stop or cooldown. UPC Night
and Umbreon Battle Deck both read as sold out at 15:31:19/27 UTC. This is a dated
recovery check, not a sustained-coverage or future-stock guarantee.

## Product failure isolation 0.5.8

On October 19 the collector disabled itself at 22:57 UTC with READ_FAILURES;
one identity error in a three-product batch exceeded the former twenty-percent
threshold. After restart, the missing Elite Trainer Box tab (B0H78BB9TY) caused
another three-product batch stop at 23:32 UTC. These were real acquisition gaps,
not a server outage, night break or active challenge cooldown.

Version 0.5.8 was installed at 23:33 UTC with a public-file backup. Per-product
read errors stay visible in summaries and intake but no longer disable the fleet.
They retry at the unchanged per-product cadence. Missing tabs are replaced and
local tab associations retain same-origin gate redirects for guarded reading.
Unassigned challenge/sign-in tabs and tracked foreign redirects stop conservatively.
Blocked results still stop the sweep and use the existing challenge backoff;
fatal run errors still disable monitoring. No CAPTCHA solving is introduced.

Sixteen mocked failure/tab cases and fifteen offline continuation/guard cases
passed. Background, policy, items, pacing and schedule hashes match the previous
server package. Credentials, profiles, continuation reader and watchdog were
preserved. At 23:37:57 UTC, all sixteen targets had fresh accepted readings, enabled with
no stop or cooldown. ETB B0H78BB9TY was read at 23:37:37 UTC with
NO_VERIFIED_FEATURED_OFFER: fresh page evidence, not confirmed stock. This is
point-in-time recovery, not proof of sustained availability.

## Dated verification

At October 19 22:05:47 UTC, three automatic batches yielded sixteen accepted
readings with zero read errors, challenges or intake failures. At 22:30:50 UTC,
all sixteen Amazon targets remained fresh, enabled, with no stop or cooldown.
No live gate appeared during verification; offline browser tests exercised the
click/navigation flow. Walmart had usable sold-out observations; Mercado Libre
had paused/unavailable/unconfirmed offers, not confirmed buyable stock.

## Installation and rollback

PRs 43–45 are merged in Spawn main. Credentials and profiles were preserved.
Build the 0.5.6 public upgrade with `scripts/patch-amazon-server.mjs` against the
public 0.5.4 reference, then use `scripts/patch-amazon-continuation.mjs` for the
0.5.7 four-file overlay, followed by `scripts/patch-scout-failure-isolation.mjs`
for 0.5.8. See [overlay instructions](../collector/amazon-server/README.md).
Only the continuation extractor, reader, product check and manifest changed in
0.5.7; background, pacing, read-health and heartbeat hashes remained unchanged.
Retain timestamped public-file backups and private configuration; restoring public
files and restarting the affected service rolls back that package. Do not clear
genuine challenge state, manual pauses or monitoring baselines during rollback.

## Experimental and proposed

Two concurrent preparations with one reader remain a synthetic local experiment.
Production remains serial. Dynamic enrollment from Spawn's published/staged
catalog, broader discovery scope and a Scout-aware coverage UI are proposed.
The legacy deployed Catch silent feed is paused and does not populate Scout.
New ASIN discovery alone does not install a new collector target or permit alerts.
