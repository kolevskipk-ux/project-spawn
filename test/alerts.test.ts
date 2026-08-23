import { describe, expect, it } from "vitest";
import { alertText, heartbeatText } from "../src/index";
import { canonicalizeUrl, classifyListing } from "../src/inventory";
import { percentDifference, renderBoard, type BoardRow } from "../src/board";
import type { InventoryChange, Listing } from "../src/types";

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  title: "Pokemon TCG: 30th Celebration Elite Trainer Box",
  watch_category: "30th_celebration",
  retailer: "Monsters & Spells",
  retailer_sku: "30TH-ETB",
  url: "https://example.com/products/30th-etb",
  status: "available",
  price_mxn: 2349,
  language: "english",
  language_evidence: "English packaging text is visible",
  msrp_mxn: 999,
  msrp_source_url: "https://example.com/msrp",
  evidence: "Preorder purchase action visible",
  ...overrides
});

describe("inventory classification", () => {
  it("does not alert unchanged inventory", () => {
    expect(classifyListing({ listing_key: "x", canonical_url: "x", status: "available", price_mxn: 2349 }, listing(), false)).toBe("unchanged");
  });

  it("identifies a restock and meaningful price drop", () => {
    expect(classifyListing({ listing_key: "x", canonical_url: "x", status: "sold_out", price_mxn: 999 }, listing(), false)).toBe("restock");
    expect(classifyListing({ listing_key: "x", canonical_url: "x", status: "available", price_mxn: 2600 }, listing(), false)).toBe("price_drop");
  });

  it("retains SKU-significant query parameters while removing tracking", () => {
    expect(canonicalizeUrl("https://Example.com/product/?variant=123&utm_source=x#details")).toBe("https://example.com/product?variant=123");
  });

  it("normalizes Shopify locale variants to one product URL", () => {
    expect(canonicalizeUrl("https://monstersandspells.com/en/products/example?variant=123"))
      .toBe("https://monstersandspells.com/products/example?variant=123");
  });
});

describe("Discord copy", () => {
  it("makes an overpriced listing unmistakable", () => {
    const change: InventoryChange = { listingKey: "x", type: "new", previousPrice: null, listing: listing() };
    const message = alertText(change);
    expect(message).toContain("NEW LISTING");
    expect(message).toContain("English");
    expect(message).toContain("135% above MSRP");
    expect(message).toContain("⚠️");
  });

  it("discloses unconfirmed language and MSRP", () => {
    const change: InventoryChange = { listingKey: "x", type: "new", previousPrice: null,
      listing: listing({ language: "unknown", language_evidence: "", msrp_mxn: null, msrp_source_url: null }) };
    expect(alertText(change)).toContain("Language unconfirmed");
    expect(alertText(change)).toContain("MSRP: **unconfirmed**");
  });

  it("uses a non-repetitive heartbeat", () => {
    const message = heartbeatText(new Date("2026-08-20T12:00:00Z"), "America/Mexico_City", false);
    expect(message).toContain("No verified new listings, restocks, or meaningful price drops");
    expect(message).not.toContain("Sources scanned");
  });
});

describe("Inventory Board", () => {
  const row: BoardRow = {
    listing_key: "one", title: "Night & Day <UPC>", watch_category: "30th_celebration", retailer: "Amazon México",
    retailer_sku: "SKU-1", language: "english", price_mxn: 5500, status: "available", last_change_type: "new",
    first_seen_at: "2026-08-23T10:00:00.000Z", last_seen_at: "2026-08-23T11:00:00.000Z", canonical_url: "https://example.com/product",
    amazon_launch_mxn: 3800, amazon_confidence: "exact", collectr_usd: 531.13, usd_mxn_rate: 18.65
  };

  it("calculates current price against a reference", () => {
    expect(percentDifference(5500, 3800)).toBe(45);
    expect(percentDifference(5500, null)).toBeNull();
  });

  it("renders the private board with escaped product data and pricing context", () => {
    const html = renderBoard([row], "private-token", new Date("2026-08-23T12:00:00.000Z"));
    expect(html).toContain("Spawn Live Inventory");
    expect(html).toContain("Night &amp; Day &lt;UPC&gt;");
    expect(html).toContain("+45%");
    expect(html).toContain("inventory.csv?access=private-token");
    expect(html).not.toContain("Night & Day <UPC>");
  });
});
