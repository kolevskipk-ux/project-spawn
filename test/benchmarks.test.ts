import { describe, expect, it } from "vitest";
import { parseBenchmarkCandidate, verifyCatchSignature } from "../src/benchmarks";

const candidate = () => ({
  event_id: "catch-amazon-30th-day-upc-20260821T195200Z-364900",
  source: "catch_em_all",
  source_version: "V6.4.0",
  source_product_id: "amazon-30th-day-upc",
  retailer: "Amazon México",
  product_name: "30th Celebration Ultra-Premium Collection — Day",
  asin: "B0H77VYKSM",
  product_url: "https://www.amazon.com.mx/dp/B0H77VYKSM",
  observed_state: "PREORDER_BUYABLE",
  price_mxn: 3649,
  observed_at: "2026-08-21T19:52:00.000Z",
  sold_by_amazon: true,
  fulfilled_by_amazon: true
});

async function signature(secret: string, timestamp: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  return `sha256=${[...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

describe("Catch Em All benchmark ingestion", () => {
  it("accepts a tightly scoped Amazon Mexico observation", () => {
    expect(parseBenchmarkCandidate(candidate())).toMatchObject({ asin: "B0H77VYKSM", price_mxn: 3649, source: "catch_em_all" });
  });

  it("rejects non-Amazon URLs, unavailable states, and malformed prices", () => {
    expect(parseBenchmarkCandidate({ ...candidate(), product_url: "https://example.com/dp/B0H77VYKSM" })).toBeNull();
    expect(parseBenchmarkCandidate({ ...candidate(), observed_state: "SOLD_OUT" })).toBeNull();
    expect(parseBenchmarkCandidate({ ...candidate(), price_mxn: -1 })).toBeNull();
  });

  it("validates HMAC signatures inside the replay window", async () => {
    const secret = "a-secure-shared-secret-with-more-than-32-characters";
    const now = Date.parse("2026-08-23T15:30:00.000Z");
    const timestamp = String(Math.floor(now / 1000));
    const body = JSON.stringify(candidate());
    expect(await verifyCatchSignature(secret, timestamp, await signature(secret, timestamp, body), body, now)).toBe(true);
    expect(await verifyCatchSignature(secret, timestamp, "sha256=" + "0".repeat(64), body, now)).toBe(false);
    expect(await verifyCatchSignature(secret, String(Number(timestamp) - 301), await signature(secret, String(Number(timestamp) - 301), body), body, now)).toBe(false);
  });
});
