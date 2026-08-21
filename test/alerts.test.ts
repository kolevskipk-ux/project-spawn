import { describe, expect, it } from "vitest";
import { alertText, heartbeatText } from "../src/index";
import { canonicalizeUrl, classifyListing } from "../src/inventory";
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
