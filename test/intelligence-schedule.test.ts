import {describe,expect,it} from "vitest";
import {isEarlyAsinIntelligenceWindow} from "../src/index";

describe("bounded early-ASIN schedule",()=>{
  it("runs only at 04:05 Mexico City local time",()=>{
    expect(isEarlyAsinIntelligenceWindow(new Date("2026-08-29T10:05:00Z"),"America/Mexico_City")).toBe(true);
    expect(isEarlyAsinIntelligenceWindow(new Date("2026-08-29T10:04:00Z"),"America/Mexico_City")).toBe(false);
    expect(isEarlyAsinIntelligenceWindow(new Date("2026-08-29T11:05:00Z"),"America/Mexico_City")).toBe(false);
  });
});
