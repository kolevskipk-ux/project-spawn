# Project Spawn state

Reviewed October 19, 2026. [Garfield functionality map](GARFIELD_FUNCTIONALITY.md)
is the coordinated activation map; [GARFIELD.md](GARFIELD.md) defines ownership.

## Deployed and enabled

- Production source: `main`, including PRs 41–45; latest functional merge
  `63d3c5d` (PR 45). Worker `201d3ed5-3a29-449c-a6d1-dd797bae5851` serves 100%
  traffic, deployed October 19 at 22:07:57 UTC. Configuration `8.7.0-inventory`.
  Cloudflare build/deploy follows merges; server extension installation is separate.
- OpenAI-assisted market discovery, three-hour windows outside quiet hours,
  plus the bounded 04:05 early-ASIN window in America/Mexico_City. Families:
  30th Celebration, Ascended Heroes, Delta Reign, exact Hobbit Collector Box pilot.
  Early-ASIN search covers only 30th and Delta Reign; discovery is not exhaustive.
- D1 holds discovery, identity, approvals, publication, observations, customer
  events and audit history. Individual Access-authenticated operator views and
  separate customer eligibility/privacy/support flows are deployed.
- Scoped Amazon/Walmart/Mercado Libre browser intake and Amazon coverage health.
  Fresh page reads, qualifying offers and customer stock claims are distinct.
- Customer inventory events and unverified Amazon advisories are delivered by
  Catch. Spawn owns durable queues and review state, not customer Discord routing.
  Mercado Libre operator alerts and Scout health alerts are enabled.
- Reviewed pricing references and multilingual identity handling; inventory link
  metrics enabled. Unknown language and unavailable evidence remain explicit.

## Scout server

Amazon 0.5.7 runs separately from marketplace 0.4.4. The fixed Amazon list has
sixteen products; hot cadence is four minutes and others twelve minutes plus
jitter, in serial batches of at most six. Marketplace has two Walmart and five
Mercado Libre identities, separate thirty-minute schedules and quiet hours.
See [Scout server runbook](docs/scout-marketplace-server.md).

The 0.5.7 continuation flow rejects genuine challenges, permits one guarded ordinary
shopping continuation and rereads identity/offer evidence. Pacing, manual pauses,
challenge backoff and watchdog protections remain. At October 19 22:30:50 UTC,
all sixteen Amazon targets had fresh server readings; no active stop/cooldown.
This dated snapshot is not a continuous-availability guarantee. Marketplace labels
for paused/unavailable/unconfirmed offers do not establish verified stock.

## Disabled or expired

- Reliable-store pilot expired October 15 at 01:53:47.969 UTC. Pilot flag remains
  true but expiry prevents new claims. No automatic extension or broad restart.
- Broad store catalog sync/fast maintenance, general inventory revalidation,
  automatic trusted-store/pending approvals, approval digest, Amazon enrichment
  and drop search are disabled. Market discovery remains enabled.
- Catch stores-only mode pauses its legacy Amazon/marketplace acquisition;
  paid browser fallback and legacy daily hunt digest are disabled.

## Enrollment and proposals

Twenty published Amazon monitoring targets do not imply twenty Scout targets:
four are outside its fixed sixteen. Sixty older Amazon seed listings have inventory
visibility only. The pending Figure Collection `B0H788HLPY` needs identity/language
review; Heavy Hitters `B0HKVJPJGW` was not discovered in retained scans.

The deployed legacy staging feed for independently verified 30th/Delta Reign
identities is inactive for acquisition under Catch stores-only mode. Automatic,
bounded, quiet staged-ASIN enrollment into Scout is proposed, not implemented.
Broader discovery, queue pagination and Scout coverage UI are also proposed.
The two-preparation/one-reader pipeline remains an isolated synthetic experiment.

## Navigation and operational limits

`/ops` is the operations entry; `/approvals` shows approved inventory;
`/approvals?view=queue` shows pending review; `/ops/search` shows search estimates.
The listing queue caps its oldest rows at 200; current pending eligibility is 230.
The legacy coverage panel and monitoring option still refer to Catch rather than
Scout. Treat this as a known UI gap, not evidence of Scout enrollment.

At the October 19 audit, October discovery accounting estimated USD 35.694 against
the USD 150 application guard, with no held reserves. These are search estimates,
not an account-wide provider invoice or Cloudflare cost guarantee.

## Evidence and maintenance

See [functionality map](GARFIELD_FUNCTIONALITY.md),
[pilot final status](docs/reliable-store-pilot.md),
[server continuation overlay](collector/amazon-server/README.md), and
[release record](OPERATIONS_RELEASE_RECORD.md). Each release must record source,
deployment, activation, scope, dated verification, limitations and expiry together.
The [August 29 snapshot](docs/history/SPAWN_STATE-20260829.md) is historical only;
its release IDs, access model and pending V8.1 statements are superseded.
