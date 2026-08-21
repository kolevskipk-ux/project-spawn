import { describe, expect, it } from "vitest";
import { discordText } from "../src/index";

describe("discordText", () => {
  it("creates a bounded Discord status message", () => {
    const message = discordText({
      summary: "No material changes.",
      sources_scanned: 3,
      listings_evaluated: 4,
      available: 1,
      sold_out: 2,
      unknown: 1,
      changes: ["One listing became available"],
      listings: [{
        title: "Ascended Heroes ETB",
        retailer: "Example Store",
        url: "https://example.com/product",
        status: "available",
        price_mxn: 999,
        evidence: "Add-to-cart control was visible"
      }]
    }, new Date("2026-08-20T12:00:00Z"), "America/Mexico_City");

    expect(message).toContain("SPAWN — Hourly Scan");
    expect(message).toContain("Ascended Heroes ETB");
    expect(message.length).toBeLessThanOrEqual(1950);
  });
});
