# Spawn pricing-reference policy

Spawn presents two separate benchmarks. Neither is described as guaranteed resale value.

## Customer-facing format

```text
Price: $n MXN
vs Amazon launch: ±xx%
vs Collectr: ±xx%
```

The percentage always describes the current retailer price. A positive value is above the reference; a negative value is below it.

## Amazon launch reference

Use this source hierarchy:

1. Exact Amazon México preorder or launch price, sold or fulfilled by Amazon.
2. Exact launch price from another major authorized Mexican retailer.
3. Amazon México launch price for a comparable product of the same format, generation, language, and contents.
4. A launch range supported by multiple established Mexican retailers.
5. Unavailable when none of the above is defensible.

Comparable values must be labeled `strong_proxy` or `estimated_range`; they must not be represented as an exact MSRP.

## Collectr market reference

Use an exact product and variant match whenever possible. Record:

- Collectr product URL
- USD market value
- Capture date
- USD/MXN conversion rate and date
- Product language, region, and condition assumptions

The board converts the stored USD value using the captured exchange rate. It does not include shipping, tax, marketplace fees, or liquidity.

## Required catalog fields

| Field | Requirement |
|---|---|
| Canonical product name | Exact normalized product identity |
| Watch category | `30th_celebration` or `ascended_heroes` |
| Product type | UPC, ETB, booster bundle, poster collection, etc. |
| Language | Confirmed language or unknown |
| Amazon launch MXN | Exact value or approved proxy |
| Amazon source URL | Direct source or archived evidence |
| Amazon capture date | When launch price was observed |
| Amazon confidence | Exact, strong proxy, or estimated range |
| Collectr USD | Current captured market value |
| Collectr source URL | Exact Collectr product page |
| Collectr capture date | When market value was observed |
| USD/MXN rate | Rate used for the displayed comparison |

## Review rule

Pricing references are curated separately from hourly availability scans. A reference is published only after the product identity and source have been reviewed. Hourly scans must not overwrite curated pricing data.

## Normalized target model

The existing `products` columns remain the current read model. Future schema work should be additive and normalize identity and references as follows.

### Canonical product and variant

- `canonical_product_id`: stable identity for the product family and format.
- `variant_id`: stable identity for language, region, edition, contents, and packaging variant.
- `source_identity`: retailer/source plus ASIN, SKU, Collectr identifier, or Catch product ID.
- A source identity maps to one reviewed variant. Ambiguous random-assortment listings remain separate variants or are explicitly marked mixed/unknown.

### Price reference

Each reference is an immutable observation with:

- `reference_type`: `amazon_launch` or `collectr_market`.
- `amount` and `currency` as observed; never overwrite the original currency value.
- `captured_at`, source URL, source identifier, and evidence note.
- Canonical `variant_id`, language, region, condition, and product format.
- `confidence`: `exact`, `strong_proxy`, or `estimated_range` for launch references; Collectr references require an exact reviewed variant match.
- For conversions: exchange-rate value, source, rate date, and target currency.
- Review status, reviewer, review timestamp, and superseded-reference link.

Corrections create a new record and supersede the old one. Historical references remain auditable.

## Selection and display rules

- Amazon launch and Collectr answer different questions and are never collapsed into one benchmark.
- Select only references matching the listing's reviewed canonical variant.
- Amazon proxy references may cross retailers only under the documented hierarchy and must be visibly labeled.
- Collectr must not cross language, region, edition, product format, or condition merely because product names resemble each other.
- Convert Collectr USD using the rate captured with that reference. Do not silently refresh the rate while retaining the old market value.
- If identity or provenance is incomplete, display the reference as unavailable instead of estimating silently.

## Catch candidate promotion

Catch observations remain in `benchmark_candidates` until an operator:

1. maps the source product and ASIN to a canonical variant;
2. verifies seller/fulfilment evidence and launch timing;
3. chooses `exact`, `strong_proxy`, `estimated_range`, or rejects the candidate;
4. creates a new immutable price-reference record with an audit note.

Approval is an explicit Spawn operation. Intake alone never promotes or updates a published reference.
