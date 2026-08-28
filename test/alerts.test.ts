import { describe, expect, it } from "vitest";
import { alertText, handleFetch, heartbeatText, isAmazonDiscoveryWindow, rawDiscoveryText } from "../src/index";
import { D1_MULTI_ROW_BATCHES, D1_SAFE_VARIABLE_LIMIT, amazonAsin, canonicalizeUrl, classifyListing, d1RowsPerStatement } from "../src/inventory";
import { percentDifference, renderBoard, type BoardRow } from "../src/board";
import { feedbackClientNonce, requestRateKey } from "../src/security";
import type { Env, InventoryChange, Listing } from "../src/types";
import { benchmarkContext, isQuietWindow, normalizeVendor, printSeries, productType } from "../src/garfield";
import { weekKey } from "../src/weekly-feedback";
import { isMtgHobbitAlertable, mtgHobbitDealClassification } from "../src/mtg";

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
  it("keeps every multi-row D1 statement within the safe binding limit as schemas grow", () => {
    for (const batch of Object.values(D1_MULTI_ROW_BATCHES)) {
      expect(batch.rowsPerStatement).toBe(d1RowsPerStatement(batch.bindingsPerRow));
      expect(batch.rowsPerStatement * batch.bindingsPerRow).toBeLessThanOrEqual(D1_SAFE_VARIABLE_LIMIT);
      expect((batch.rowsPerStatement + 1) * batch.bindingsPerRow).toBeGreaterThan(D1_SAFE_VARIABLE_LIMIT);
    }
  });

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

  it("clearly labels an MTG pilot alert with its classification and reference range", () => {
    const change: InventoryChange = { listingKey:"mtg", type:"new", previousPrice:null, listing:listing({
      title:"Magic: The Gathering | The Hobbit Collector Booster Box — 12 Packs", watch_category:"mtg_hobbit_collector_box",
      retailer:"Example TCG", price_mxn:9_999, msrp_mxn:7_850, evidence:"Factory sealed display containing 12 Collector Booster packs; add-to-cart is active"
    }) };
    expect(alertText(change)).toContain("MTG — High Priority: Excellent Buy");
    expect(alertText(change)).toContain("Official implied MSRP: ~MX$7.7–8.0k");
  });
  it("labels raw discoveries as unverified research leads", () => {
    const message = rawDiscoveryText({ listingKey:"raw", type:"new", previousPrice:null, listing:listing({
      retailer:"Example Store", status:"unknown", availability_state:"unknown", language:"unknown", price_mxn:null
    }) });
    expect(message).toContain("UNVERIFIED DISCOVERY");
    expect(message).toContain("Research lead only");
    expect(message).toContain("Language unconfirmed");
    expect(message).not.toContain("VERIFIED BUYABLE");
  });
});

describe("MTG Hobbit pilot policy", () => {
  it("implements every requested MXN price band", () => {
    expect(mtgHobbitDealClassification(8_500)).toBe("Exceptional / near-MSRP");
    expect(mtgHobbitDealClassification(10_500)).toBe("Excellent Buy");
    expect(mtgHobbitDealClassification(12_500)).toBe("Good Deal");
    expect(mtgHobbitDealClassification(14_000)).toBe("Acceptable / Availability Opportunity");
    expect(mtgHobbitDealClassification(15_000)).toBe("Market-ish");
    expect(mtgHobbitDealClassification(15_001)).toBe("Poor Value");
  });

  it("alerts only on confirmed English 12-pack boxes at or below the availability ceiling", () => {
    const exact = listing({ title:"The Hobbit Collector Booster Box — 12 Collector Boosters", watch_category:"mtg_hobbit_collector_box", price_mxn:14_000,
      evidence:"Factory sealed box with 12 Collector Boosters; add-to-cart is active" });
    expect(isMtgHobbitAlertable(exact)).toBe(true);
    expect(isMtgHobbitAlertable({ ...exact, price_mxn:14_001 })).toBe(false);
    expect(isMtgHobbitAlertable({ ...exact, title:"The Hobbit Collector Booster — Single Pack" })).toBe(false);
    expect(isMtgHobbitAlertable({ ...exact, evidence:"Add-to-cart is active; pack count and sealed condition are not stated" })).toBe(false);
    expect(isMtgHobbitAlertable({ ...exact, status:"unknown" })).toBe(false);
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

describe("shared Garfield policy", () => {
  it("runs scheduled discovery only once per three-hour Mexico City window", () => {
    expect(isAmazonDiscoveryWindow(new Date("2026-08-27T18:05:00Z"),"America/Mexico_City")).toBe(true);
    expect(isAmazonDiscoveryWindow(new Date("2026-08-27T19:05:00Z"),"America/Mexico_City")).toBe(false);
  });
  it("uses the configured Mexico City quiet window with an exclusive end", () => {
    expect(isQuietWindow(new Date("2026-08-26T08:05:00Z"), "America/Mexico_City")).toBe(true);
    expect(isQuietWindow(new Date("2026-08-26T12:05:00Z"), "America/Mexico_City")).toBe(false);
  });
  it("normalizes vendors and print series consistently", () => {
    expect(normalizeVendor("Amazon México")).toBe("amazon-mexico");
    expect(printSeries("delta_reign")).toBe("Delta Reign");
    expect(productType("Delta Reign Build & Battle Display")).toBe("build_battle_display");
  });
  it("uses a stable local-week key for trend analysis", () => {
    expect(weekKey(new Date("2026-08-26T12:00:00Z"), "America/Mexico_City")).toBe("2026-W35");
  });
  it("alerts when a preorder placeholder materially opens", () => {
    expect(classifyListing({ listing_key:"x", canonical_url:"x", status:"unknown", availability_state:"preorder_placeholder", price_mxn:null }, listing({availability_state:"available"}), false)).toBe("preorder_open");
  });
  it("classifies against whichever benchmarks are available without rejecting above-market offers", () => {
    expect(benchmarkContext(800, 1000, null).classification).toBe("Strong Value");
    expect(benchmarkContext(1200, null, 1000).classification).toBe("Above Market");
    expect(benchmarkContext(1200, null, null).classification).toBe("Benchmark Unavailable");
    expect(benchmarkContext(1, 1000, null, "preorder_placeholder").classification).toBe("Placeholder Price");
    expect(benchmarkContext(100, 1000, null).classification).toBe("Suspicious Price");
  });

  it("extracts Amazon México ASINs without accepting lookalike hosts", () => {
    expect(amazonAsin("https://www.amazon.com.mx/dp/B0H78BB9TY?tag=example")).toBe("B0H78BB9TY");
    expect(amazonAsin("https://amazon.com.mx/gp/product/B0H783FY5Z/")).toBe("B0H783FY5Z");
    expect(amazonAsin("https://amazon.com.evil.test/dp/B0H78BB9TY")).toBeNull();
    expect(amazonAsin("https://www.amazon.com.mx/s?k=ascended+heroes")).toBeNull();
  });
});
