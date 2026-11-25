# Amazon México drop readiness and incident workflow

Use this checklist for each new expansion or product group entering Scout. Record the results in the release or incident record, with timestamps in America/Mexico_City and UTC. A product is alert-ready after it passes each applicable check below.

## Before the drop

| Check | Evidence to record |
| --- | --- |
| Confirm listing identity and scope | Canonical Amazon México URL, exact ASIN, language, product type, and title match. Record who should receive alerts, the intended Discord channel, and which ASINs are Scout-only. |
| Verify collector enrollment | Query the live Spawn target catalog with the production collector identity. Confirm Scout loaded the same version and exact target set. Check the schedule, due times, latest sweep, and any active pause or cooldown. |
| Verify fresh page reads | Collect one normal Scout observation per ASIN. Record the timestamp, collector, read result, and whether the product identity matched. An unavailable page with a verified identity passes the collection check. A challenge, redirect, or unknown identity needs follow-up. |
| Verify observation intake | Match each genuine Scout observation ID to its Spawn receipt. Record HTTP failures and the response reason. If intake requires publication, confirm the expected entry is published or approved for observation-only intake before calling it ready. Scout-only entries should be able to record evidence without appearing in public inventory or sending alerts. |
| Verify automatic delivery | Use an isolated fixture or a labeled test event through the same Catch routing and delivery code used for live alerts. Confirm channel and message IDs and the delivery acknowledgement. Replay the same event ID to verify deduplication. Confirm Scout-only targets produce no customer alerts. Keep synthetic offers out of production inventory and observation history. |
| Confirm coverage for the drop window | Compare the oldest per-ASIN page read and receipt with the agreed polling cadence and expected drop window. Record any gap, challenge, rejected receipt, or delivery failure and who is responsible for it. Escalate an unresolved gap before the drop. |

A direct webhook test verifies the Discord destination. An end-to-end Catch test verifies event handling, route selection, and delivery. A real page read verifies collection. Record all three results independently.

## When a drop is missed

1. Capture the reported time, timezone, source, and affected ASINs. Keep the reported drop time distinct from the first offer Scout actually observed.
2. Compare the collector’s run history, Spawn receipts, advisory records, and Catch delivery acknowledgements around the window. Preserve relevant timestamps, observation IDs, HTTP status and reason, and destination message IDs. Avoid copying credentials or full page contents.
3. Identify the first missing step for each affected ASIN. Look for catalog drift or a late sweep, page identity failure, an Amazon shopping prompt or CAPTCHA, rejected intake, an unqualified offer, a missing route, and failed Discord delivery or deduplication.
4. Assign the fix and record how to verify it. Run a genuine page check and a labeled delivery test after the fix. Record any stage that still lacks evidence. Preserve existing challenge controls and avoid replaying stale offers as current stock alerts.

## Known incidents

- **Flowing Fists, November 24, 2026.** The drop was reported at 6:10 p.m. Mexico City time. The confirmed collector evidence includes three Spanish listings at 6:48–6:49 p.m. and the English Booster Bundle at 6:59 p.m. Scout saw Amazon México offers, then Spawn returned HTTP 409. The ASINs were cataloged in Scout and absent from the published Spawn watchlist. The webhook tests passed, while the automatic Catch route was still pending. Follow-up is to persist Scout-only receipts independently of publication and validate automatic routing for the four English listings.
- **Delta Reign.** A missed drop was reported. The September production release note for Scout 0.5.1 documents activation and its verification limits. Establish the affected drop window and recover timestamped evidence before assigning a cause.

## Automated checks

The Scout server runs the read-only Flowing Fists readiness check every 15 minutes via its user systemd timer. Each report lists catalog membership, observation receipt IDs and freshness for all eight ASINs. The check exits nonzero when any ASIN lacks a fresh server receipt. View the reports with `systemctl --user status scout-drop-readiness.timer` and `journalctl --user -u scout-drop-readiness.service`.

Run `python3 scripts/check-scout-drop-readiness.py --discord-test` on the Scout server for a release smoke test. This sends four labeled English ASIN test events through Spawn and Catch, checks the Discord channel and message IDs, and replays the same batch to verify deduplication. The unattended timer runs without this flag.
