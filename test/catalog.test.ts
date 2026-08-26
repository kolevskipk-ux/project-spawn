import { describe, expect, it } from "vitest";
import { catalogProductId } from "../src/catalog";

describe("catalogProductId", () => {
  it("matches retailer title variations for reviewed English formats", () => {
    expect(catalogProductId({ title:"Cartas Coleccionables Pokemon TCG Mega Evolution Ascended Heroes Booster Bundle en Ingles", watch_category:"ascended_heroes", language:"english" })).toBe("ah-en-booster-bundle");
    expect(catalogProductId({ title:"Pokémon TCG: 30th Celebration – Poster Collection (Cartas en Inglés)", watch_category:"30th_celebration", language:"english" })).toBe("30-en-poster");
  });

  it("does not cross language variants", () => {
    expect(catalogProductId({ title:"Ascended Heroes Elite Trainer Box (ESPAÑOL)", watch_category:"ascended_heroes", language:"spanish" })).toBeNull();
  });

  it("keeps Day and Night UPC variants separate", () => {
    expect(catalogProductId({ title:"30TH Celebration Ultra-Premium Collection - Night", watch_category:"30th_celebration", language:"english" })).toBe("30-en-upc-night");
  });
});
