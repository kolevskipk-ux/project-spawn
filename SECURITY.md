# Project Spawn security framework

## Security boundaries

| Surface | Control |
|---|---|
| Hourly cron | Cloudflare scheduled trigger plus global D1 scan lock |
| Manual `/run` | Operator bearer token, edge rate limit, 15-minute D1 cooldown, global scan lock, audit events |
| Public health | Minimal response and edge rate limit |
| Operator diagnostics | Bearer-protected `/admin/status` |
| Inventory Board | Revocable shared token during private review; replace before member launch |
| Production hostname | `spawn.aztlan-eng.com`; `workers.dev` is disabled after migration verification |
| Feedback links | 30-day expiry, edge rate limit, per-alert ceiling, anonymous device receipt deduplication |
| D1 state | No destructive or reset endpoint; additive migrations; Cloudflare Time Travel recovery |
| Deployments | GitHub `main` is source of truth; Cloudflare secrets are not stored in Git |

## Destructive operations policy

Spawn does not expose an inventory reset, baseline reset, delete-history, secret-management, schema-management, or deployment endpoint.

If a baseline rebuild is required:

1. Record the current D1 Time Travel bookmark.
2. Export the affected tables when longer retention is required.
3. Prepare a forward-only migration or reviewed maintenance statement.
4. Preview the exact affected row count.
5. Preserve `inventory_observations` and `scan_runs`.
6. Record the maintenance action in `security_events`.
7. Verify `/admin/status`, the board, and the next scheduled scan.

Do not implement a general-purpose SQL or reset endpoint.

## D1 recovery

Cloudflare D1 Time Travel is automatic. Retrieve the current recovery bookmark before material maintenance:

```text
npx wrangler d1 time-travel info SPAWN_DB
```

Restore only after confirming the target time or bookmark and the affected database:

```text
npx wrangler d1 time-travel restore SPAWN_DB --bookmark=<reviewed-bookmark>
```

Free-plan recovery history is shorter than paid-plan history. For retention beyond the Time Travel window, export D1 to controlled long-term storage.

## Secret inventory

- `OPENAI_API_KEY`
- `DISCORD_WEBHOOK_URL`
- `RUN_TOKEN`
- `BOARD_ACCESS_TOKEN`
- Future Discord OAuth client secret
- Future session-signing key

Rotate one credential at a time, verify the dependent function, and then revoke the old credential. Never paste secrets into GitHub files, Discord, logs, screenshots, or issue reports.

## Owner account checklist

### GitHub

- Enable MFA or a passkey.
- Decide intentionally whether the repository remains public.
- Protect `main` against force pushes and deletion.
- Require pull requests and successful automated checks before merge when the collaboration model supports it.
- Review installed GitHub Apps and Cloudflare repository access.
- Keep dependency alerts enabled.

### Cloudflare

- Enable MFA or a passkey.
- Review active sessions and OAuth applications.
- Keep deployment and D1 permissions limited to required operators.
- Review Worker request, CPU, D1, and error metrics weekly during testing.
- Rotate OAuth authorization after suspected account compromise.

### Discord

- Restrict webhook-management permission.
- Rotate the webhook immediately if its URL is exposed.
- Do not post board access tokens or operator endpoints in public channels.
- Use role-based authentication before paid or membership-gated board access.

### OpenAI

- Keep the organization hard limit and awareness threshold active.
- Use a project-specific key when available.
- Rotate the key after suspected disclosure.
- Review usage independently of Worker request counts.

## Incident priorities

1. Revoke exposed credentials.
2. Stop unauthorized external effects such as Discord posts or OpenAI spend.
3. Preserve logs, scan history, and D1 recovery bookmarks.
4. Roll back the Worker if a release caused the incident.
5. Restore D1 only when code rollback cannot repair state.
6. Document cause, scope, correction, and prevention before resuming broader access.
