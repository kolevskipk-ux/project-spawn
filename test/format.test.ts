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
    expect(message).not.toContain("Sources scanned");
    expect(message).not.toContain("One listing became available");
    expect(message).not.toContain("No material changes.");
    expect(message.length).toBeLessThanOrEqual(1950);
  });

  it("does not disclose internal scan diagnostics when nothing is available", () => {
    const message = discordText({
      summary: "A retailer was blocked during inspection.",
      sources_scanned: 4,
      listings_evaluated: 7,
      available: 0,
      sold_out: 3,
      unknown: 4,
      changes: ["Blocked retailer details"],
      listings: []
    }, new Date("2026-08-20T12:00:00Z"), "America/Mexico_City");

    expect(message).toContain("No verified availability to report this hour.");
    expect(message).not.toContain("blocked");
    expect(message).not.toContain("Sources scanned");
  });
});
