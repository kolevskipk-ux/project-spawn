# Scout marketplace server preparation — October 13, 2026

The existing production marketplace receipts are not usable coverage: Mercado Libre
reports TAB_MISSING and Walmart reports unknown. Amazon Scout remains operational
on main@100.86.242.81. Its Firefox service is left untouched.

`scripts/prepare-marketplace-server.mjs` builds a separate Firefox 0.4.1 collector
from the existing marketplace extension. It retains the exact five recovered
Mercado Libre identities, two Walmart identities, seller/identity/53100 delivery
requirements, distinct credentials, and 30-minute quiet-hour-aware schedules.
First commissioning opens the approved product tabs and enables both schedules;
later restarts preserve manual disablement. No new customer marketplace alerts
or seller verification is inferred.

The generated non-secret package passed 21 browser extraction cases with every
network request intercepted, plus scheduling, history, disabled-state and lease
checks. It uses a separate profile and service to avoid disrupting Amazon Scout.
The local build is work/Scout-Marketplace-Server-0.4.1 in the Garfield workspace.

Server preparation uses the existing Mercado Libre extension credential and
Windows-protected Walmart credential; it does not rotate either. Credentials are
sent only to main@100.86.242.81 over the existing encrypted Tailscale SSH connection,
stored in permission-600 configuration files, excluded from Git and tool output.

Automatic approval review rejected this credential transfer because explicit
authorization naming the credentials and server destination is missing. No server
package, credential or service was installed by the rejected action. The prepared
script work/prepare-marketplace-server.ps1 remains unexecuted. A separate permitted
step staged only the non-secret package with empty credentials on the server;
native web-ext lint returned zero errors, notices and warnings. No marketplace
service was created or started. The blocked credential action was not bypassed.

After approval: prepare files, run the existing server web-ext lint against the
build, separately enable/start scout-marketplace.service, inspect real readings
and authenticated receipts, then document actual coverage. Any account verification
or CAPTCHA must be handled by Philip. Unknown readings must never be reported as
stock. Stop the separate service to roll back; Amazon monitoring remains independent.

## Approved server activation — October 13, 2026

Philip explicitly authorized merging Spawn #41 and Catch #34 into main and
transferring the existing Walmart/Mercado Libre credentials to main@100.86.242.81.
Both PRs merged successfully (Spawn 70ac199; Catch e2dd7fe). Credential transfer
succeeded over Tailscale SSH with no values printed; both private files are 600.
scout-marketplace.service is enabled and running with its own profile. Amazon's
scout-amazon.service remains active and unchanged.

Live commissioning found Firefox's newly created tabs initially lacked committed
URLs and Walmart's offer area hydrated after document loading. Version 0.4.2 adds
a bounded URL-commit wait, selects each product tab before its normal reload, and
rechecks pending offer DOM for up to six seconds without another navigation.
Mercado Libre /captcha/wall is explicitly a challenge; known challenged tabs are
preserved for manual handling rather than reopened. Manual disablement survives
service restarts. Every network request in 21 extraction fixtures was intercepted;
scheduling/history/lease checks pass. Native Firefox lint has zero findings.

At 2026-10-14T02:31:46.848Z Spawn accepted Walmart Ditto sold_out, MX$749, seller
Walmart and postcode 53100. The UPC returned unknown with MX$3370 and the same
seller/postcode: its purchase/stock evidence was inconclusive. All five Mercado
Libre identities returned blocked / ACCOUNT_VERIFICATION, accepted by Spawn.
No CAPTCHA was solved, seller approval inferred, or customer marketplace alert
enabled. Philip must personally complete retailer verification in the server's
marketplace Firefox profile before those pages can provide usable coverage.

Both retailers retain separate 30-minute schedules and 02:05–06:05 Mexico City
quiet hours. Configured credentials were preserved during the public-code update.
The separate service can be stopped without stopping Amazon Scout.

## Server reliability repair — October 19, 2026

The Firefox event page was opening another observer dashboard every time it woke.
The server accumulated 272 observer tabs. Version 0.4.3 initializes once per
browser session using storage.session, keeps one dashboard, and preserves product
and verification tabs. Walmart and Mercado Libre alarms are staggered by two
minutes; simultaneous alarms queue instead of discarding the second retailer's
run. Product lookup rechecks the saved tab ID and validates its current identity
or mapped verification URL before inspection. An unrelated saved tab is rejected.

Build with `node scripts/prepare-marketplace-server.mjs`. Existing private config
files must be preserved when installing public files; generated credentials are
blank. Build the Amazon public patch with
`node scripts/patch-amazon-server.mjs <existing-public-0.5.4-dir>`.
Run `node tests/scout-server-reliability.mjs` (self-contained) and the marketplace
extraction suite. After building the Amazon patch, run
`node tests/scout-amazon-server-startup.mjs <generated-amazon-patch-dir>` to check
interrupted-lease recovery, preserved challenge cooldowns/manual pauses, and live
lease protection on event-page wakes.

The Amazon server patch produces version 0.5.5 public files only. Its previous
READ_FAILURES stop counted other sellers' featured offers and unverified option
panels as failed page reads. These now remain inconclusive without disabling
monitoring; missing tabs, failed reads and challenge protections still stop as
before. Offer qualification and customer alert rules are unchanged. The patch
also reports the existing authenticated Scout heartbeat and initializes the
dashboard once per browser session. A new browser session releases the terminated
process's interrupted sweep lease; ordinary worker wakes never clear a live lease.
Resume monitoring through the normal
dashboard toggle after installing; installation preserves deliberate pauses.

The owner authorized applying these repairs directly to the two server services.
Public files were backed up separately before installation; private credentials
and browser profiles were retained. No Worker deployment, migration or extension
of the expired store pilot is part of this repair. Runtime receipts and the final
verification assessment are saved in the task workspace under work/.

## Pacing and coverage upgrade — October 19, 2026

The October 16–19 07:00 Mexico City overnight reports correspond to actual gaps:
Amazon stopped on October 16 and did not submit again until October 19. Amazon's
server collector runs continuously. Its 21:30–06:00 notification deferral and
07:00 summary are independent of the marketplace/Catch 02:05–06:05 quiet period.
The audit is retained in work/scout-overnight-audit-20261019.json in this task.

Amazon server 0.5.6 prioritizes four hot products every four minutes and other
products every twelve minutes, with up to fifteen seconds of positive jitter and
at most six due products per tick. Foreground reads stay serial. Challenge
cooldowns and manual pauses survive installation and watchdog checks. Spawn
counts a title-matched inconclusive offer as a successful page read while keeping
offer qualification and stock authority separate. Failed reads and challenges do
not refresh coverage. A scheduled break is exempt only when explicitly reported
by a fresh collector heartbeat during the server-bounded 02:05–06:05 interval;
Amazon does not report or acquire such a break by default. Overnight summaries use
the current night's detection time instead of an old incident's first date.

Marketplace server 0.4.4 labels receipts server-marketplace and reports paused or
unavailable pages without approving their seller or changing unknown stock state.
The authenticated marketplace status endpoints accept ?collector=server-marketplace
to avoid mixing legacy clients' missing-tab diagnostics with server evidence.
Labels are self-reported diagnostics; authorization still depends on scoped tokens.
Existing unlabeled receipts and idempotent retries remain compatible.

The user systemd scout-watchdog timer checks a small, secret-free browser snapshot
every two minutes. It only restarts an already active Amazon service when product
progress is stale for twenty minutes and the next run is overdue by ten minutes,
including a stuck scheduler whose heartbeat is still alive. Disabled collectors,
manual pauses, safety stops, challenge cooldowns, planned breaks, missing evidence,
and intentionally inactive services are protected. Restarts are capped at one per
hour and two per rolling day. It cannot recover a powered-off server. Existing
Spawn health notifications remain the remote indicator of server loss.

The two-preparation/one-reader pipeline is an isolated local experiment with no
retailer traffic. Production concurrency remains one while Amazon is challenged;
synthetic timing is not a production speed estimate. No store-pilot extension,
seller-policy relaxation, or paid browser activation accompanies this upgrade.
