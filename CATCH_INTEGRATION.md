# Catch Em All benchmark handoff

Catch Em All remains the deterministic availability monitor. Spawn receives its Amazon México price observations as reviewable benchmark candidates. Observations never update the approved `products` catalogue automatically.

## Trust boundary

- Endpoint: `POST https://spawn.aztlan-eng.com/internal/benchmark-candidates`
- Authentication: HMAC-SHA256 with a dedicated shared secret stored only as encrypted Worker secrets
- Headers: `X-Spawn-Timestamp` (10-digit Unix seconds) and `X-Spawn-Signature` (`sha256=<lowercase hex>`)
- Signed value: `<timestamp>.<exact request body>`
- Replay window: five minutes
- Edge limit: 30 requests per minute for the integration
- Duplicate key: sender-generated `event_id`; retries are safe
- Maximum body: 16 KiB

## Candidate payload

```json
{
  "event_id": "catch-amazon-30th-day-upc-20260821T195200Z-364900",
  "source": "catch_em_all",
  "source_version": "V6.4.0",
  "source_product_id": "amazon-30th-day-upc",
  "retailer": "Amazon México",
  "product_name": "30th Celebration Ultra-Premium Collection — Day",
  "asin": "B0H77VYKSM",
  "product_url": "https://www.amazon.com.mx/dp/B0H77VYKSM",
  "observed_state": "PREORDER_BUYABLE",
  "price_mxn": 3649,
  "observed_at": "2026-08-21T19:52:00.000Z",
  "sold_by_amazon": true,
  "fulfilled_by_amazon": true
}
```

Only buyable Amazon México observations are accepted. Seller and fulfilment flags may be `null` when the source page does not prove them; those candidates require manual evidence review.

## Catch Em All dev handoff

No Catch Em All production code is changed by this repository. Its separate `dev` change should:

1. Build the payload from the existing `product`, extracted price, offer details, and `meta:<product.id>` observation.
2. Send only successful `PREORDER_BUYABLE` or `BUYABLE` Amazon observations with numeric MXN prices.
3. Generate a stable event id from product id, observed timestamp, and price so retries deduplicate.
4. Sign the exact serialized body and timestamp.
5. Use a short timeout and fail open: Spawn ingestion failure must not interrupt Catch monitoring or Discord alerts.
6. Store only delivery status metadata in Catch KV; never store the shared secret or response body.
7. Add the endpoint URL as a non-secret variable and `CATCH_INGEST_SECRET` as an encrypted secret.
8. Test on Catch `dev`; merge and deploy only with separate approval.

## Review rule

Candidates start as `pending`. Approval must confirm product identity, product format, language/region, launch timing, and seller/fulfilment evidence. Approval into the curated product catalogue is a separate operator action and is never performed by the ingestion request.
