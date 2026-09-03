import { describe, expect, it } from "vitest";
import { handleFetch, isAmazonDiscoveryWindow } from "../src/index";
import { D1_MULTI_ROW_BATCHES, D1_SAFE_VARIABLE_LIMIT, amazonAsin, canonicalizeUrl, classifyListing, d1RowsPerStatement } from "../src/inventory";
import { catchHuntSnapshot, percentDifference, renderBoard, type BoardRow, type CatchHuntSnapshot } from "../src/board";
import { feedbackClientNonce, requestRateKey } from "../src/security";
import type { Env, Listing } from "../src/types";
import { benchmarkContext, isQuietWindow, normalizeVendor, printSeries, productType } from "../src/garfield";
import { weekKey } from "../src/weekly-feedback";
import { isMtgHobbitAlertable, mtgHobbitDealClassification } from "../src/mtg";
import { validateFulfilmentReview } from "../src/cross-border";

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
    expect(html).toContain('id="store"');
    expect(html).toContain('<option value="amazon méxico">Amazon México</option>');
    expect(html).toContain('data-store="amazon méxico"');
    expect(html).not.toContain("Night & Day <UPC>");
  });

  it("renders the reviewed Collectr conversion with the captured Banxico rate",()=>{
    const html=renderBoard([{...row,title:"30th Celebration Booster Bundle",retailer:"Juguetibici",price_mxn:979,amazon_launch_mxn:null,amazon_confidence:null,collectr_usd:89.90,usd_mxn_rate:17.0427}],"token",new Date("2026-08-23T12:00:00.000Z"));
    expect(percentDifference(979,89.90*17.0427)).toBe(-36);
    expect(html).toContain("≈ −36%");
    expect(html).toContain("Strong Value");
  });

  it("does not count evidence older than 36 hours as confirmed available",()=>{
    const html=renderBoard([{...row,last_seen_at:"2026-08-20T00:00:00.000Z",revalidation_state:"STALE",revalidation_last_outcome:"ERROR"}],"token",new Date("2026-08-23T12:00:00.000Z"));
    expect(html).toContain("<strong>0</strong><span>Confirmed available</span>");
    expect(html).toContain('data-status="unknown"');
    expect(html).toContain(">Stale</span>");
  });

  it("unifies the complete Catch Amazon hunt with inventory and removes duplicate offers", () => {
    const amazonRow = { ...row, retailer_sku:"B0ABC12345", canonical_url:"https://www.amazon.com.mx/dp/B0ABC12345" };
    const hunt: CatchHuntSnapshot = { available:true, mode:"NORMAL", degraded:false, rollout:"safe-hourly", rows:[
      { id:"amazon-one", name:"30th Celebration ETB", asin:"B0ABC12345", url:"https://www.amazon.com.mx/dp/B0ABC12345", cadenceClass:"hot", cadenceMinutes:60,
        persistedState:"BUYABLE", lastTrustworthyAt:"2026-08-23T11:30:00.000Z", overdue:false, overdueReason:null, lastCheck:{ observedState:"BUYABLE", price:"$1,999 MXN", seller:"Amazon México" } },
      { id:"amazon-two", name:"Delta Reign Bundle", asin:"B0DEF67890", url:"https://www.amazon.com.mx/dp/B0DEF67890", cadenceClass:"warm", cadenceMinutes:60,
        persistedState:"SOLD_OUT", lastTrustworthyAt:"2026-08-23T11:00:00.000Z", overdue:false, overdueReason:null, lastCheck:{ observedState:"SOLD_OUT" } }
    ] };
    const html = renderBoard([amazonRow], "private-token", new Date("2026-08-23T12:00:00.000Z"), hunt);
    expect(html).not.toContain("Amazon México Hunt");
    expect(html).toContain("30th Celebration ETB");
    expect(html).toContain("Delta Reign Bundle");
    expect(html).toContain("Inventory offers");
    expect(html).toContain('<option value="amazon méxico">Amazon México</option>');
    expect((html.match(/<article class="hunt-card"/g) ?? [])).toHaveLength(2);
    expect(html).not.toContain('class="offer"');
  });

  it("sanitizes Catch status input and fails closed when status is unreachable", async () => {
    const env = { CATCH_MONITOR_ENDPOINT:"https://catch.example/status" } as Env;
    const goodFetch = async () => new Response(JSON.stringify({
      architecture:{ cadenceRolloutMode:"safe-hourly" }, health:{ retailerAccess:{ amazon:{ mode:"NORMAL", degraded:false } } }, rows:[
        { group:"amazon", id:"valid", name:"Valid ASIN", asin:"b0abc12345", url:"javascript:alert(1)", cadenceClass:"hot", cadenceMinutes:60, persistedState:"BUYABLE" },
        { group:"pokemon", id:"wrong-group", asin:"B0DEF67890" }, { group:"amazon", id:"bad-asin", asin:"unsafe" }
      ]
    }), { status:200, headers:{ "content-type":"application/json" } });
    const snapshot = await catchHuntSnapshot(env, goodFetch as typeof fetch);
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].asin).toBe("B0ABC12345");
    expect(snapshot.rows[0].url).toBe("https://www.amazon.com.mx/dp/B0ABC12345");
    expect(snapshot.rollout).toBe("safe-hourly");
    const failed = await catchHuntSnapshot(env, (async () => new Response("no", { status:503 })) as typeof fetch);
    expect(failed).toMatchObject({ available:false, rows:[], error:"http_503" });
  });

  it("renders and filters a confirmed international offer with checkout disclosure",()=>{
    const html=renderBoard([{...row,retailer:"Pokémon Plug",fulfilment_region_state:"CROSS_BORDER_CONFIRMED",retailer_country:"US",ship_from_country:"US",original_price:219.99,original_currency:"USD",mexico_delivery_status:"CONFIRMED",shipping_mxn:null,import_cost_status:"UNKNOWN",destination_checked_at:"2026-08-23T11:00:00Z",destination_fresh_until:"2026-08-24T23:00:00Z"}],"token",new Date("2026-08-23T12:00:00Z"));
    expect(html).toContain("🌎 International offer");
    expect(html).toContain("USD 219.99 displayed item price");
    expect(html).toContain("may be added or changed at checkout");
    expect(html).toContain('id="fulfilment"');
    expect(html).toContain('data-fulfilment="cross_border"');
  });
});

describe("cross-border publication gate",()=>{
  const form=(entries:Record<string,string>)=>{const value=new FormData();for(const [key,item] of Object.entries(entries))value.set(key,item);return value;};
  it("accepts only fresh confirmed Mexico delivery evidence",()=>{
    const valid={fulfilment_region_state:"CROSS_BORDER_CONFIRMED",retailer_country:"US",ship_from_country:"US",original_price:"219.99",original_currency:"USD",shipping_mxn:"",import_cost_status:"UNKNOWN",destination_checked_at:"2026-09-03T12:00:00Z",destination_fresh_until:"2026-09-05T12:00:00Z"};
    expect(validateFulfilmentReview(form(valid),Date.parse("2026-09-03T13:00:00Z")).ok).toBe(true);
    expect(validateFulfilmentReview(form({...valid,destination_fresh_until:"2026-09-03T12:30:00Z"}),Date.parse("2026-09-03T13:00:00Z"))).toMatchObject({ok:false,error:"cross_border_requires_fresh_destination_evidence"});
    expect(validateFulfilmentReview(form({...valid,fulfilment_region_state:"CROSS_BORDER_UNVERIFIED"}),Date.parse("2026-09-03T13:00:00Z"))).toMatchObject({ok:false,error:"fulfilment_not_publishable"});
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
    OPENAI_API_KEY: "unused", PUBLIC_BASE_URL: "https://example.com", BOARD_ACCESS_TOKEN: "board",
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

  it("fails closed on unauthenticated seed and manual revalidation operations", async () => {
    const seed=await handleFetch(new Request("https://example.com/admin/seed-campaigns",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}),minimalEnv);
    expect(seed.status).toBe(401);
    const revalidate=await handleFetch(new Request("https://example.com/admin/revalidation/run",{method:"POST"}),minimalEnv);
    expect(revalidate.status).toBe(401);
    const verify=await handleFetch(new Request("https://example.com/admin/seed-verification/run",{method:"POST"}),minimalEnv);
    expect(verify.status).toBe(401);
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
