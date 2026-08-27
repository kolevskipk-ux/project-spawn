import type { Env, Listing } from "./types";
import { hasMtgHobbitBoxEvidence, isMtgHobbitCollectorBox, MTG_HOBBIT_CATEGORY } from "./mtg";

export const normalizeVendor = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const printSeries = (category: string) => ({ "30th_celebration": "30th Celebration", ascended_heroes: "Ascended Heroes", delta_reign: "Delta Reign", [MTG_HOBBIT_CATEGORY]: "The Hobbit" } as Record<string, string>)[category] ?? category;
export const productType = (title: string) => {
  const value = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (value.includes("collector booster") && (value.includes("box") || value.includes("display"))) return "collector_booster_box";
  for (const [needle, type] of [["build & battle display","build_battle_display"],["build & battle kit","build_battle_kit"],["elite trainer box","elite_trainer_box"],["booster bundle","booster_bundle"],["booster box","booster_box"],["sleeved booster","sleeved_booster"],["3-pack blister","three_pack_blister"],["1-pack blister","one_pack_blister"]] as const) if (value.includes(needle)) return type;
  return "other";
};

export function isQuietWindow(now: Date, timezone: string, start = "02:05", end = "06:05"): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minutes = Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value);
  const parse = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
  const from = parse(start), to = parse(end);
  return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

export async function suppressedVendorKeys(env: Env): Promise<Set<string>> {
  const rows = await env.SPAWN_DB.prepare("SELECT vendor_key FROM vendors WHERE status='SUPPRESSED'").all<{ vendor_key: string }>();
  return new Set(rows.results.map(row => row.vendor_key));
}

export function normalizedCandidate(listing: Listing, listingKey: string) {
  const mtgHobbit = isMtgHobbitCollectorBox(listing) && hasMtgHobbitBoxEvidence(listing);
  if (listing.language !== "english" || (!mtgHobbit && !["ascended_heroes", "delta_reign"].includes(listing.watch_category))) return null;
  return { candidate_id: listingKey, source: "spawn", source_url: listing.url, source_listing_key: listingKey,
    vendor: listing.retailer, vendor_key: normalizeVendor(listing.retailer), product_name: listing.title,
    product_family: mtgHobbit ? "Magic: The Gathering | The Hobbit" : printSeries(listing.watch_category), print_series: printSeries(listing.watch_category), product_type: productType(listing.title), language: listing.language,
    retailer_sku: listing.retailer_sku, observed_price_mxn: listing.availability_state === "preorder_placeholder" ? null : listing.price_mxn,
    availability_state: listing.availability_state ?? listing.status };
}

export function benchmarkContext(price: number | null, amazon: number | null, collectrMxn: number | null, availabilityState?: string) {
  const references = [amazon, collectrMxn].filter((v): v is number => v != null && v > 0);
  if (availabilityState === "preorder_placeholder") return { reference_mxn: references[0] ?? null, delta_percent: null, classification: "Placeholder Price" };
  if (price == null || !references.length) return { reference_mxn: references[0] ?? null, delta_percent: null, classification: "Benchmark Unavailable" };
  const reference = Math.min(...references), delta = Math.round(((price - reference) / reference) * 100);
  return { reference_mxn: reference, delta_percent: delta, classification: price < reference * .25 ? "Suspicious Price" : delta <= -10 ? "Strong Value" : delta <= 10 ? "Fair / Market" : "Above Market" };
}
