# Scout self-recovery and mobile restart

Deployed November 2, 2026 (Spawn PRs 52–53). Scope: the Amazon Linux collector only. Walmart and
Mercado Libre remain on their existing schedules and services.

## Operations experience

Open `/ops/health` on the protected Garfield website. When SCOUT_CONTROL_ENABLED=true, the owner sees a permanent
**Restart Scout** button, fresh accepted page coverage out of 16, agent status,
and the last request outcome. Viewer/admin accounts cannot restart. The button
is disabled when the agent is stale, the collector is paused/protected, or the
restart budget is exhausted. Native forms work without JavaScript on mobile.

The server polls on the existing two-minute watchdog timer. Requests expire in
ten minutes, are claimed atomically once, and have a one-hour request cooldown.
A request restarts only `scout-amazon.service`; no shell command, service name,
URL, path, or argument is accepted from the browser. The server token never
enters dashboard HTML. Access authentication and same-origin form checks apply.

A restart acknowledgement is distinct from restored coverage. The dashboard
reports unknown when the agent stops reporting. A claimed request that times
out is displayed as outcome unconfirmed and is never automatically replayed.

## Automatic recovery

The agent reads the existing full health export and the smaller watchdog export,
using newer pause/stop state when available. Successful page reads and accepted
intake receipts determine coverage. Sold-out pages and recognized inconclusive
seller reads count as readable, without certifying Amazon stock. Failed page
checks, CAPTCHA, and identity failures do not count.

Automatic restart requires either the original stalled-progress condition or
repeat `PAGE_CHECK_FAILED` errors across at least 12 of the 16 configured targets,
with no readable result for two expected product intervals plus jitter. A single
broken SKU does not restart the browser. Restarts require an active service and
preserve disabled monitoring, manual pauses, stop reasons, and cooldowns.

Both mobile and automatic restarts share a durable maximum of one per rolling
hour and two per rolling day. Intent is recorded before invoking systemd, and a
file lock prevents overlapping invocations. The agent saves compact failure
evidence, preserves the Firefox profile, and waits up to twenty minutes for fresh
accepted reads on every target after the restart. Two distinct fresh exports
across consecutive agent checks confirm recovery. Restart failure, exhausted
budget, or missing recovery becomes `attention_required`.

Spawn uses its existing Ops webhook and health-monitor lease to send one recovery
failure escalation per incident, with existing overnight notification deferral.
The message links directly to System health. HTTP success proves Discord accepted
the message; phone push notification settings remain external to Garfield.

## Deployment procedure (completed November 2; repeat only with approval)

No schema migration, browser extension update, new secret, paid browser activation,
Cloudflare cron change, baseline reset, or new public server port is needed.

PRs 52–53 were approved, merged, and deployed; the server recovery agent was installed. November 2 runtime audit: SCOUT_HEALTH_ALERTS_ENABLED and SCOUT_DIAGNOSTICS_ENABLED are true, but SCOUT_CONTROL_ENABLED is absent/off. Remote restart code is deployed but its control is currently disabled. Restoring the previously approved control is included in the new coverage rollout proposal.

1. Review and merge the `codex/scout-self-recovery` branch.
2. Deploy only the Spawn Worker code, retaining production variables. Do not use
   `npm run deploy`, which also runs migrations. Keep `SCOUT_CONTROL_ENABLED`
   absent/false until the server agent is installed.
3. Back up the installed watchdog script and local watchdog state. Install
   `scripts/scout-watchdog.py` at
   `/home/main/.local/share/scout-firefox-test/scout-watchdog.py` with mode 0600.
   Retain the current timer/service and Firefox profile. The script reads the
   existing server collector token locally from `server/private-config.js`;
   it never prints it. Python 3 standard library and systemd are sufficient.
4. Separately set `SCOUT_CONTROL_ENABLED=true` on Spawn, preserving other vars.
   Wait for an agent report, check `/healthz`, `/readyz`, and `/ops/health`.
5. From the authenticated owner dashboard, verify one real restart request,
   one claim, the service start timestamp, preserved pause/baseline state, and
   restored coverage. That restart consumes the real shared restart budget.
6. Confirm viewers/admins cannot restart and reload does not enqueue a request.
   Check the protected page on a narrow mobile viewport.

Rollback: first disable `SCOUT_CONTROL_ENABLED`; this disables remote requests
and recovery-specific notifications. Restore the backed-up watchdog script to
also disable coverage-driven local restarts. Retain the state journal and browser
profile; do not clear a challenge or manual pause. Restore the prior Worker
version if needed. Code deployment and flag activation remain separate actions.

## Validation

- TypeScript typecheck and 380 repository tests passed before final UI refinements;
  affected control/health tests rerun after those refinements.
- Fifteen isolated Python tests passed on the Linux server without invoking the
  agent main loop or changing any production service.
- Existing production collector recovered to 16/16 fresh accepted reads at
  2026-11-02 15:09:14 UTC (09:09 Mexico City) after the diagnostic browser restart.
- Live agent-to-Worker reporting was verified. An actual restart initiated from the mobile form remains an acceptance check; no unnecessary production restart was fabricated.

The local HTML preview renders successfully through the operations shell. The
in-app browser could not reach the local preview server, so narrow-viewport
visual inspection remains an acceptance check; no visual browser QA is claimed.
The final policy was also evaluated read-only against the real saved outage
snapshot (15 failing targets: restart) and recovered snapshot (16 fresh targets:
no restart). Those tests did not replace the production agent. The separately approved agent installation completed afterward.
