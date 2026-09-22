# Garfield Amazon Observer 0.3.0

0.3.0 adds **Buying options shown — click to see offers**. This reports an enabled, visible control inside the matching product buybox, without clicking it or checking the offers. Local notifications occur on first detection and on confirmed absent → shown changes. Unknown/blocked checks preserve the previous signal to prevent duplicate notifications. This signal never replaces the last verified stock state and takes precedence over conflicting main-page unavailable text.

Intake transport is prepared for `POST https://spawn.aztlan-eng.com/internal/amazon-browser/observe`, using a separate Amazon-only collector credential in `private-config.js`. The default credential is empty, so all observations remain local until production intake is activated. No Walmart, Mercado Libre or Catch credential may be reused. The dashboard shows Local only, Saved to Spawn, or the delivery error. There is no replay of stale checks: the next scheduled check tries again. Keep populated credentials private and out of Git/exports. Backend records are diagnostic only: no inventory mutations or customer alerts.

To update, reload this extension at `edge://extensions`, accept the new Spawn host permission if requested, and refresh the dashboard. Enabled/paused state and existing history are preserved.

0.2.1 fixes title validation for the live Sylveon/Greninja tin listing (Amazon places "Tin" before the Pokémon names). URL and DOM ASIN checks remain required. Export version now follows the manifest.

Standalone local Edge pilot, separate from the Walmart and Marketplace extensions.

## Install and start

1. Open `edge://extensions`, enable Developer mode, and choose Load unpacked.
2. Select this `Amazon-Edge-Observer` directory.
3. Open Garfield Amazon Observer from Edge's Extensions menu to open its dashboard.
4. Select **Open product tabs**, then **Refresh & check now**. Inspect results against the visible Amazon offers.
5. Select **Enable 5-minute checks**. Scheduling is initially off. It runs 24/7 while Edge runs and the computer is awake, without quiet hours. The first scheduled pass is due five minutes after enabling.

Keep all 14 Amazon tabs open. Resolve challenges manually. Missing tabs, unknown layouts, redirects and blocked access do not replace the last verified observation. Checks run two tabs at a time, with a sweep lease and an in-process lock preventing overlap. Pause stops subsequent batches; the current pair may finish. No purchases, login automation, CAPTCHA solving or account changes.

## Updating from 0.1.0

In `edge://extensions`, click Reload on Garfield Amazon Observer, then refresh its dashboard tab. Accept the storage permission if Edge requests it. Existing enabled/paused state and history are preserved. Click **Open product tabs** to open the ten added products without duplicating existing matching tabs. Verify the dashboard says 14 products and has a next-check time if enabled.

The new `unlimitedStorage` permission allows eight days of local history for the larger catalog without hitting the standard extension quota. History remains bounded per product and is never uploaded by this pilot.

## Scope

- All 14 known published Amazon México 30th-anniversary listings in Catch's catalog snapshot dated September 22, 2026 UTC: Day UPC, Night UPC, random Day/Night UPC, ETB, Booster Bundle, Tech Sticker, Poster, Mew Figure, Mewtwo Figure, Sylveon ex Box, Binder, Sylveon/Greninja Tin, Pikachu Night Mini Tin, and Umbreon ex Battle Deck. Exact ASINs are in `items.js`. This is not a claim that every listing on Amazon has been discovered. New catalog products require a subsequent extension update.
- Featured-offer detection plus Buying Options control visibility; alternate sellers are not inspected or enumerated. An available result needs matching URL/DOM ASIN/title, a visible enabled purchase control, positive price and seller. A visible Buying Options control yields the separate unverified signal. Otherwise explicit primary availability text with no enabled purchase control can establish a primary-page sold-out result. Missing offers remain unknown.
- Local desktop notification on the first verified available result or a verified sold-out → available change. Windows notification settings may suppress display. Notification clicks open the product.
- Spawn intake is prepared but disabled until its separate credential is configured after deployment. No Discord delivery or paid queries. Amazon and Spawn host permissions plus alarms/storage/unlimitedStorage/scripting/notifications.
- Records contain offer facts and timing, not page HTML, cookies or customer addresses. They describe the current browser's delivery context; there is no postcode guarantee.
- Up to 2,304 observations per product (eight days at five-minute cadence), plus lifetime check counters and last verified state. Export JSON for analysis. Browser sleep delays alarms; it does not establish zero stock or zero missed drops. Uninstalling removes local history.

## Validation

Run `node test.mjs` using the local bundled Playwright dependency. Tests intercept every browser request and exercise extraction in real headless Edge plus scheduling/history checks. Live evidence must be assessed separately; passing fixtures is not proof of Amazon availability coverage.
