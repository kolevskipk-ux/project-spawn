# Garfield Marketplace Observer — local Mercado Libre pilot

Version 0.4.0. Separate unpacked extension; does not replace the running Walmart
extension. Both schedules start off. Leave Walmart disabled here while the old
extension is operating to avoid duplicate checks.

## Mercado Libre scope

Five original item IDs recovered from Catch's known targets:

| Product | Original listing resolver |
| --- | --- |
| Poster Collection | https://articulo.mercadolibre.com.mx/MLM-5984325176-_JM |
| Ditto Premium | https://articulo.mercadolibre.com.mx/MLM-5983271312-_JM |
| Booster Bundle | https://articulo.mercadolibre.com.mx/MLM-5984323768-_JM |
| Binder Collection | https://articulo.mercadolibre.com.mx/MLM-5984325128-_JM |
| Elite Trainer Box | https://articulo.mercadolibre.com.mx/MLM-5983272222-_JM |

The original URL slugs were not recovered. These resolver links are reconstructed
from the original IDs. UPC has no recovered listing ID and is not enrolled.
The two catalog pages supplied by Philip are also accepted for inspection:
Booster Bundle `MLM75624347` and Elite Trainer Box `MLM75656814`.
Both still require the original listing ID in the actual primary offer. URL
`wid` and `official_store:1214` are navigation hints, never proof of the current
offer or seller. Other catalog URLs and seller listing IDs are rejected.
The popup uses cleaned catalog links for these two products, omitting advertising
parameters. A catalog's replacement offer cannot become a verified observation.

Sold-out layouts may omit the purchase offer entirely. A visible exact
`Producto agotado` message near the matching product title is recorded separately
as pageAvailability=sold_out, while state stays unknown and seller unconfirmed.
This never replaces lastVerified. Hidden/recommendation messages and contradictory
enabled purchase buttons do not qualify. Live validation is still required;
the layout handling was tested with fixtures based on Philip's screenshot.

Philip's screenshot identifies the seller reference as `MERCADOLIBRE HOME_MX`,
with the `Tienda oficial Pokemon` badge. It does not expose a numeric seller ID.
All expected seller IDs remain null until verified on the original listing.
The local preview displays extracted seller name and numeric ID for that review.
Full is fulfillment evidence only, never seller approval.

## Test in Edge

1. Open `edge://extensions`, enable Developer mode, and load this folder unpacked.
2. Use your usual signed-in Edge profile. Sign in yourself if prompted.
3. Open a recovered product link using the popup, then choose **Check current product tab**.
4. Review the seller and reason in the result. Unknown is expected until the numeric
   seller is confirmed. Live selectors are provisional; fixture tests do not verify
   Mercado Libre's current page layout.
5. Optional 30-minute checks refresh only matching open tabs. Quiet hours are
   02:05–06:05 America/Mexico_City. The computer must remain awake.

Mercado Libre results stay local when its separate credential is empty (the staged
default). With an activated Spawn backend and credential, new checks are sent to
the Mercado Libre intake endpoint and acknowledged as Saved to Spawn. The latest
48 checks per item remain in extension storage, including failed deliveries.
Unknown/blocked/error never replace the last verified state. There is no customer
alert, account credential collection or automatic purchase. Backend implementation
and migration 0042 are prepared, but production activation is pending approval.
Uninstalling this extension removes its local history. Credentials and complete
page contents are never injected into or collected from a page.

Walmart retains its existing scoped intake endpoint but needs a local credential
in private-config.js. The committed/staged default is empty. Do not commit or
share populated credentials. Mercado Libre never uses Walmart's token.

## Verification

Run `node collector/marketplace-extension/test.mjs` from project-spawn on the
configured Codex workstation. Tests intercept every browser request, exercise
extraction with synthetic DOM fixtures, then check scheduling and local intake.

Next release steps: production approval and activation of the separate intake,
followed by one real receipt verification. Stable seller identity and an available
offer still need live validation before customer inventory/alerts can be added.
Native Mercado Libre Notify Me notifications are not connected.
