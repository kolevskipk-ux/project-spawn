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
