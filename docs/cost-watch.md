# Discord cost watch

Philip requested production Discord alerts on September 19, 2026.

The existing task heartbeat runs every 30 minutes on Philip's desktop. It uses
scripts/read-cost-metrics.mjs to read Cloudflare hourly analytics and Spawn health.
The script reads the existing Wrangler OAuth credential only for the Cloudflare
API and never prints it. If expired, refresh through `wrangler d1 list` and retry.
It returns total database rows read/written and query counts. Historical pre-fix
hours and the mixed 23:00 UTC deployment hour cannot establish post-fix behavior.
Only complete, fresh post-fix hours are eligible; missing analytics means unknown.
Read-cost estimates use US$1 per billion rows after included allowance, not the
complete account invoice. Analytics may revise recent buckets.

An initial US$5/day projected D1 read-cost threshold is an investigation trigger,
not spending authorization. Send a warning when exceeded, a single confirmation
when fresh measurements demonstrate recovery, or an unavailable-monitor alert
after two failed checks. Suppress identical warnings until materially changed.

Production endpoint POST /internal/cost-watch/alert uses a separate COST_WATCH_TOKEN
and only the existing OPS_DISCORD_WEBHOOK_URL. Customer hunt webhooks are never
used. Payload: id (stable incident/retry ID), kind (TEST, ELEVATED, RECOVERED,
MONITOR_UNAVAILABLE, HEALTH_FAILURE), summary (maximum 1400 characters).
Migration 0045 stores durable delivery receipts by primary key. A two-minute
claim prevents overlapping sends; successful repeats do not resend. Retry the
same exact receipt after failed delivery. A crash after Discord accepts but
before receipt persistence can still duplicate a message.

scripts/send-cost-alert.ps1 accepts a JSON ReceiptFile and reads the scoped token
from work/cost-watch-token.xml, protected with Windows DPAPI. The token is not
committed. Discord mentions are disabled. A setup TEST confirms end-to-end delivery.

This is a desktop-driven monitor with production Discord delivery, not an
independent Cloudflare cost polling cron. The computer must stay awake and Codex
running. Discord phone notifications depend on Philip's channel/app settings.
No separate mobile ChatGPT agent has been contacted. Production alerts do not
authorize automatic production changes, service shutdowns, or budget increases.

Validation: 312 tests and TypeScript passed; test covers auth rejection, payload
validation, routing, deduplication, conflicting receipt IDs and failed-send retries.

Production activation completed September 19 at 17:30 Mexico City: migration 0045,
source ad0354c, Worker a84f3847-6439-458f-92d1-603721a9ef58; scoped-secret activation
created version 9b7f77b4-62be-4838-b35b-a259fa861691. The setup receipt
setup-20260919 returned delivered after secret propagation; readyz returned ok.
Heartbeat garfield-d1-cost-watch was updated to use this route every 30 minutes.
Rollback Worker: 1e590e97-c33b-4341-9d29-45cc8f2ece58 (cost repair remains active).
