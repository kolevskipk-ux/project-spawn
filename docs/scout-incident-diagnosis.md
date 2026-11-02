# Scout incident diagnosis and independent host reporting

Deployed November 2, 2026 (Spawn PR 54, Catch documentation PR 40). The system timer installation and recurring reports were verified at 23:30 UTC. This does not activate cloud acquisition or change restart decisions.

## What is measured

A separate **system** timer, every minute with ten seconds of allowed timer
jitter, runs a read-only Python reporter as `main`. It does not depend on
Firefox, a graphical session, the user watchdog timer, or an existing export.
It makes no service start/restart, login, baseline or inventory mutations.

The reporter sends a bounded aggregate to a fixed authenticated endpoint using
the existing server collector credential. It sends no credential value in the
payload, product HTML, machine identifiers, command output, or customer data.
Its local probes inspect loginctl sessions, the two fixed collector services,
boot time, and the Amazon collector export. Missing/corrupt exports and missing
user service managers produce unknown evidence without preventing a heartbeat.
Redirects are refused. The client identifies itself as Garfield-Scout-Host/1.0.

Cloudflare validates the server-only credential, version, fields, counts and
clock freshness; strips unsolicited fields; records its own receipt timestamp;
and rejects old/duplicate samples. One worker_state row is updated. No migration
or new secret is needed. The endpoint is independent of SCOUT_CONTROL_ENABLED;
SCOUT_DIAGNOSTICS_ENABLED separately controls reporting and diagnosis display.

## Interpretation

System health shows a working diagnosis, confidence, next action, and an evidence
table with UTC timestamps and ages. Host evidence expires after three minutes;
collector exports/heartbeats use five minutes. Coverage still uses the existing
five-minute hot and fifteen-minute normal product freshness limits.

- Host report missing but Scout signals fresh: independent reporter/path problem;
  do not claim the server is powered off.
- Host and Scout signals missing: server or reporting path unavailable. Power,
  network, reporter failure, clock problems and endpoint trouble remain uncertain.
- Host reachable, no graphical session and collector not running: desktop login
  required. SSH and the display-manager greeter do not count as a desktop login.
- Service inactive/failed with a desktop available: report the service state;
  an intentional stop cannot be distinguished from a fault without its journal.
- Fresh manual pause/disabled export: preserve intentional monitoring state.
- Fresh challenge evidence: likely retailer access issue; do not bypass it.
- Running service with stale/missing export: telemetry problem, uncertain cause.
- Fresh local reads with failed intake and missing accepted coverage: likely
  collector-to-Spawn intake/connectivity/authentication issue.
- Fresh accepted coverage of all sixteen: coverage healthy. Historical failures
  do not override restored coverage, except a current explicit challenge stop.
- Repeat runtime failures with missing coverage: likely Scout/browser workflow
  problem; page-load and network failures still require underlying diagnostics.
- Unconfirmed identities and unexplained coverage gaps remain explicitly uncertain.
- Newly started, progressing collectors may be warming up at the existing cadence.

The most recent retained **Ops** notification receipt is shown separately with
its timestamp and status. It is not a customer-alert receipt or proof of a phone
push. Outage messages may include the diagnosis while preserving existing dedup,
leases, quiet-hour deferral and recovery policy. No synthetic outage is sent.

## Deployment procedure (completed November 2; repeat only with approval)

1. Merge the reviewed Spawn implementation and matching Catch documentation PR.
2. Deploy Spawn code only, preserving live variables and all triggers. Do not use
   npm run deploy, which also runs migrations. Keep diagnostics disabled first.
3. Back up any existing reporter/units. Install the reporter at
   /home/main/.local/share/scout-firefox-test/scout-host-heartbeat.py, owned by
   main and mode 0600. It reads the existing private-config.js locally.
4. Install ops/scout-host-heartbeat.service and .timer in /etc/systemd/system.
   This requires privileged system-unit installation. This is intentionally not
   a user timer: the reporter must remain scheduled without desktop sign-in.
   Unit uses User=main, read-only home/system protection, NoNewPrivileges and
   PrivateTmp. It does not grant new remote control or start a user manager.
5. Separately set SCOUT_DIAGNOSTICS_ENABLED=true, retaining other variables.
6. Reload systemd and enable/start only scout-host-heartbeat.timer. Read its
   journal and the bounded host row; verify receipt and observed timestamps,
   login/service state, current coverage and unauthenticated HTTP 401.
7. Verify the authenticated owner/viewer dashboard render and mobile layout.
   Compare existing accepted readings and pause/baseline state. Test missing
   reports and other incident states with fixtures; do not log out, reboot or
   stop production collectors solely to manufacture an incident.

No Cloudflare cron, acquisition cadence, paid-browser policy, recovery caps,
customer destination, monitoring baseline or Firefox profile change is needed.
The reporter adds about 1,440 small heartbeat writes/day, plus bounded reads for
viewing/notification; this is workload sizing, not an account-wide billing claim.

Rollback: disable SCOUT_DIAGNOSTICS_ENABLED and stop/disable the system reporter
timer. Preserve existing Scout services and recovery timers. Restore backed-up
reporter units/files if required. Revert the Worker version only after checking
for subsequent releases. Missing reporter data must never trigger an automatic
restart or cloud failover in this change.

## Validation

The repository suite and typecheck pass. Isolated Linux tests cover missing or
corrupt exports, service-manager failures, graphical-session detection, stale
and future evidence, local versus accepted reads, timeouts, and authenticated
fixed-origin reporting with redirect rejection. A real read-only --probe on
November 2 at 22:49 UTC reported an active graphical desktop, both services
active, sixteen local/accepted reads, and no runtime, challenge or intake errors.
The new reporter is not installed or activated by that probe.

## Verified deployment record

Worker 9f10c23f-dd39-4942-88ab-9f8cedb9ae88 was activated at 100% with SCOUT_DIAGNOSTICS_ENABLED=true. Health/readiness returned OK and unauthenticated reporting returned 401. The system timer was enabled/active, its service ran as main with success, and scheduled HTTP 200 reports reached Spawn. The 23:30 UTC report showed active desktop/services, 16/16 local and accepted readings, no challenge or intake errors. Existing cron schedules were unchanged. Prepared target-catalog expansion is a separate, inactive release; fixed sixteen-target references above describe the deployed version.
