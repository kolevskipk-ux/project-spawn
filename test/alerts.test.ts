import { describe, expect, it } from "vitest";
import { alertText, handleFetch, heartbeatText } from "../src/index";
import { canonicalizeUrl, classifyListing } from "../src/inventory";
import { percentDifference, renderBoard, type BoardRow } from "../src/board";
import { feedbackClientNonce, requestRateKey } from "../src/security";
import type { Env, InventoryChange, Listing } from "../src/types";

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

describe("security helpers", () => {
  it("reuses a valid anonymous feedback receipt without storing identity", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(feedbackClientNonce(new Request("https://example.com", { headers: { cookie: `other=x; spawn_feedback_id=${id}` } })))
      .toEqual({ nonce: id, isNew: false });
  });

  it("uses Cloudflare's request key only for transient edge limiting", () => {
    expect(requestRateKey(new Request("https://example.com", { headers: { "cf-connecting-ip": "192.0.2.10" } }))).toBe("192.0.2.10");
    expect(requestRateKey(new Request("https://example.com"))).toBe("unknown");
  });

  const minimalEnv = {
    RUN_TOKEN: "operator-secret", SPAWN_CONFIG_VERSION: "5.1", OPENAI_MODEL: "test", SPAWN_TIMEZONE: "America/Mexico_City",
    OPENAI_API_KEY: "unused", DISCORD_WEBHOOK_URL: "unused", PUBLIC_BASE_URL: "https://example.com", BOARD_ACCESS_TOKEN: "board",
    SPAWN_DB: {} as D1Database
  } satisfies Env;

  it("keeps public health and version responses minimal", async () => {
    expect(await (await handleFetch(new Request("https://example.com/healthz"), minimalEnv)).json()).toEqual({ ok: true });
    expect(await (await handleFetch(new Request("https://example.com/version"), minimalEnv)).json()).toEqual({ version: "5.1" });
  });

  it("does not disclose operator endpoint details without authorization", async () => {
    const response = await handleFetch(new Request("https://example.com/admin/status"), minimalEnv);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("does not advertise endpoints from unknown routes", async () => {
    const response = await handleFetch(new Request("https://example.com/"), minimalEnv);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
