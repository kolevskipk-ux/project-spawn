# Spawn one-week tester review

Start this review only after the Inventory Board is protected by the approved access model.

## Tester instructions

For each issue, post a screenshot and direct product URL with one label:

- `duplicate`
- `wrong stock`
- `wrong language`
- `wrong price`
- `missing product`
- `broken link`

Use the Discord alert buttons when applicable:

- `Got one`
- `Too expensive`

Do not post API keys, private board access tokens, internal Worker output, or personal purchasing information.

## Daily operator check

1. Confirm the most recent scheduled scan succeeded.
2. Review new, restock, and price-drop alerts against their retailer pages.
3. Review listings not rechecked for more than 24 hours.
4. Triage tester reports by label.
5. Record corrections without deleting historical observations.

## Initial success targets

| Metric | Seven-day target |
|---|---:|
| Scheduled scan success | At least 95% |
| Duplicate customer-facing offers | Below 2% |
| Verified-available false positives | Below 5% |
| Broken purchase links | Below 2% |
| Available listings with confirmed language | At least 80% |
| Available listings with Amazon or Collectr reference | Measure baseline; set target after week one |
| Repeated unchanged Discord product alerts | Zero |

## End-of-week decision

Produce a short report covering:

- Alerts issued and useful alerts
- Confirmed purchases
- Too-expensive responses
- False availability and duplicate rates
- Language and pricing-reference coverage
- Retailers producing useful versus noisy results
- Open defects and recommended changes
- Cloudflare and OpenAI cost for the same period

Do not expand tester access or begin paid enrollment until critical stock, access-control, and privacy defects are resolved.

## Prepared Discord pin

Do not publish this message until access control is approved and tested.

```text
📋 Spawn Live Inventory

Current Pokémon TCG listings monitored by Spawn, including availability, language, launch-price context, collector-market comparison, and last verification time.

Inventory changes are classified as new listings, restocks, and price drops.

[Open Spawn Live Inventory]
```
