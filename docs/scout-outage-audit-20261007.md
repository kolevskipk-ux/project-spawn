# Scout outage audit — October 7, 2026

Production reads only; no inventory mutation, baseline reset, synthetic offer,
message send or deployment was performed for this audit.

## Findings

The last Scout intake before the gap was 2026-10-04T05:12:44.521Z;
the first after it was 2026-10-07T23:47:24.495Z. In Mexico City this is
October 3 at 23:12 through October 7 at 17:47, approximately 90 hours
35 minutes without recorded Scout observations. This establishes an intake
coverage gap, not the physical power-loss start time. October 6 and October 7
before recovery fall within it. We cannot reconstruct stock changes that were
not observed. Scout covered 16 distinct products again after restart; observed
states include sold_out and buying_options_shown. A panel signal alone does
not establish a purchasable offer.

Contrary to the initial chat assessment, Scout health alerts were deployed
and enabled October 3. Spawn's active production version is still
6998e7c3-8033-422c-94ae-5e369e5118d2. The cloud minute scheduler calls
monitorScoutHealth independently of the Scout server and outside its own quiet
hours. At the audit's first read, health state had incident=true and
notifiedSeverity=offline. Existing code sets notifiedSeverity only after a
successful webhook response. It has no last-delivery timestamp or Discord
message/channel receipt, however, so this state does not establish when the
message was sent, which channel received it, or whether Philip was notified.
There were no stored collector heartbeat keys at the first read; coverage was
being assessed from page observations rather than heartbeat telemetry.

The original detector suppresses an unchanged offline incident indefinitely
until full coverage recovers. This is a confirmed design gap and a plausible
explanation for no further warning during later drop windows. Available records
cannot establish the exact cause of Philip receiving no initial alert. Old
health snapshots overwrite one another, so historical scheduler continuity
and per-attempt webhook outcomes cannot be fully audited retrospectively.

Catch remains on amazon-continue-shopping-20261004. Its current status shows
degraded Amazon access, backoff and BUDGET failures for the browser-backed hot
lane. Two hot products also have continuationAttempted=true, gateType=none
and trustworthy readings around 23:50:58Z on October 7, proving the continuation
fix worked for those reads. This mixed coverage is insufficient to claim Catch
provided complete protection during the Scout gap.

## Proposed repair

The existing cloud detector now has bounded reminders (30 minutes offline,
60 minutes for other unresolved coverage), per-hot-window escalation and
seven-day delivery attempt history in worker_state, including HTTP status and
returned Discord receipt IDs. Explicit pause suppression remains bounded to
two hours. Recovery requires consecutive fresh samples no more than 90 seconds
apart. Notifications report coverage failures without inferring stock.

No schema migration or cron activation is required. Existing production vars,
secrets and triggers must be retained during a separately approved code release.
The proposal is on codex/scout-outage-escalation and is not deployed. TypeScript,
all 354 tests in 44 suites and Worker dry-run bundling passed; the final corrected
quiet-hour boundaries also passed the focused nine-test suite.

Receipts in the parent workspace work directory: scout-outage-audit-20261007.json,
scout-alert-audit-20261007.json and catch-outage-audit-20261007.json.

After approved deployment, verify a real Ops receipt and its destination during
a natural incident/recovery, or an explicitly authorized labelled alert test.
Discord acceptance proves message creation, not device-level notification.
An additional delivery channel or personal mentions require separately agreed
destination details. Cloud-scheduler failure still needs an external watchdog;
this repair is independent of the Scout server but relies on Spawn's scheduler.
