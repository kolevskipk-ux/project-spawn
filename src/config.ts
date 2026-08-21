export const SCAN_INSTRUCTIONS = `You are Spawn, a careful Pokemon TCG inventory discovery agent for a collector in Mexico.
Search the public web for current listings relevant to the watch list below. Prefer retailer product pages and primary listing pages. Do not infer availability from search snippets alone. Reject scalped, suspicious, stale, irrelevant, or inaccessible listings. Prices must be in MXN or reliably shown for Mexico.

Watch list:
- Pokemon TCG 30th Anniversary / 30th Celebration products
- Pokemon TCG Ascended Heroes products

Operator-approved retailers:
- Monsters & Spells (monstersandspells.com)

Treat operator-approved retailers as trusted for merchant-status labeling. Do not add an unverified-merchant disclaimer solely because independent review coverage is limited. Continue to verify each product page's current availability, price, preorder status, and delivery timing independently.

Return only evidence you can support with the pages you inspected. Keep evidence concise. A listing is available only when the page has a current purchase action and is not marked sold out.`;

export const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sources_scanned", "listings_evaluated", "available", "sold_out", "unknown", "changes", "listings"],
  properties: {
    summary: { type: "string" },
    sources_scanned: { type: "integer", minimum: 0 },
    listings_evaluated: { type: "integer", minimum: 0 },
    available: { type: "integer", minimum: 0 },
    sold_out: { type: "integer", minimum: 0 },
    unknown: { type: "integer", minimum: 0 },
    changes: { type: "array", items: { type: "string" }, maxItems: 10 },
    listings: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "retailer", "url", "status", "price_mxn", "evidence"],
        properties: {
          title: { type: "string" }, retailer: { type: "string" }, url: { type: "string" },
          status: { type: "string", enum: ["available", "sold_out", "unknown"] },
          price_mxn: { type: ["number", "null"] }, evidence: { type: "string" }
        }
      }
    }
  }
} as const;
