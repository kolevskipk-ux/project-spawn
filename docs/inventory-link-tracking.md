# Inventory click tracking

Production activated on 2026-09-12 before 09:00 America/Mexico_City,
following Philip's explicit approval. Spawn code commit: `5bf50f5`; deployed
Worker version: `b536d1a7-dcfe-4b12-a14b-3c2326d8cb84`. Catch code commit:
`60ff033`; final deployed Worker version: `3ea9bf7f-5d3e-473b-aa8f-d5a517dd0cc6`.
Migration 0041 was applied first. An anonymous live redirect returned 302
without Access sign-in and recorded the verification bot as automated. The
synthetic link and its counter were removed after verification.

The 09:00 digest delivered all five chunks across four routes using the new
format, but its links fell back to direct URLs: Cloudflare Workers rejects
`redirect: "error"`. The registration client now uses `manual` and rejects
redirect status codes. This was reproduced and regression-tested in Miniflare's
Worker runtime. A real Catch-to-Spawn registration succeeded at 09:07:15 Mexico
City, followed by a verified 302 and automated-click count. Its synthetic data
was removed and the one-time probe disabled. Today's digest was not resent;
subsequent inventory links use tracking.

Inventory Discord messages, listing publications, tracking notices, daily
watchlists and existing product links on the inventory board use opaque
`https://spawn.aztlan-eng.com/r/<id>` links when enabled. Amazon hunt alerts
always retain direct retailer links, including both the embed title and purchase
link. The separate customer portal currently has no retailer links; this change
does not add purchasing controls. Previously delivered messages are unchanged.

Catch registers destinations through authenticated
`POST /internal/garfield/inventory-links`. Registration is idempotent for URL and
product/source/route/event attribution. Only HTTPS destinations with public
hostname syntax are accepted. Redirects resolve a stored ID, never a destination
provided by the person clicking. No retailer fetch is needed.

Registration failure or a two-second timeout leaves inventory messages using
their original links. Redirect responses use 302, no-store and no-referrer;
counting uses `waitUntil` and its failure does not prevent a valid redirect.
Resolving an existing link requires the registry database to be available.
Disabling tracking stops registration/counting but preserves existing redirects.

## Metrics

Protected endpoint: `/dashboard/link-clicks.json`, with inclusive
`from=YYYY-MM-DD&to=YYYY-MM-DD`. Default: latest 30 UTC calendar days. Maximum
range: 366 days. Responses include at most 10,000 rows and a `truncated` flag;
use smaller date windows when necessary.

Rows contain day, retailer hostname, product, source, channel route, message kind,
event ID, link ID, category and count. The feature stores no customer IDs, raw
user agents, IP addresses, fingerprints or cookies. Provider request logs are
separate from application counters.

- `filtered_click`: browser-looking GET, excluding recognized bots and previews.
- `automated`: recognized bot or preview/prefetch GET.
- `unclassified`: other GET requests.

HEAD requests redirect without counting. Repeated clicks remain included.
These are request counts, not verified humans, unique visitors, impressions,
click-through rates or sales. Shared links retain their original attribution.
These limits should accompany partner reports. Registry entries are durable
to keep old links working; no visitor-level event history is created.

Suggested customer disclosure: “Inventory links measure aggregate clicks by
product and retailer before opening the retailer’s page. Amazon hunt purchase
links remain direct. We do not attach your account identity or set tracking
cookies for this measurement.” This feature does not implement personalized
advertising or automatically share information with partners.

## Activation

Keep database migration and Worker deployments as separate approved operations.
Both production Workers now have `INVENTORY_LINK_TRACKING_ENABLED=true`.
The ordered activation steps used for this release are below.

1. Apply Spawn migration `0041_inventory_link_clicks.sql`.
2. Deploy Spawn's redirect handler before enabling Catch link generation.
3. Enable Spawn tracking and confirm an anonymous `/r/<registered-id>` request
   redirects without an Access login. Keep operations/report routes protected;
   do not bypass Access for the whole host.
4. Deploy and enable Catch tracking using the existing authenticated Spawn
   service binding, or its existing Spawn endpoint and ingest credential.
5. Verify an inventory redirect and a direct Amazon hunt link. Local validation
   does not send customer messages.

Rollback: disable Catch generation first, then Spawn counting. Preserve the
redirect handler and registry tables so previously issued links keep working.

Verification covers actual SQLite migration and counters, authenticated
registration, URL rejection, idempotency, HEAD/bot handling, protected reporting,
counting failure, real Catch-to-Spawn store delivery and direct Amazon hunts.
