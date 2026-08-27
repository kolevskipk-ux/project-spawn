import type { Listing } from "./types";

export const MTG_HOBBIT_CATEGORY = "mtg_hobbit_collector_box" as const;
export const MTG_HOBBIT_PRODUCT_ID = "mtg-hobbit-en-collector-booster-box";
export const MTG_HOBBIT_MSRP_REFERENCE_MXN = { low: 7_700, high: 8_000 } as const;

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();

export function isMtgHobbitCollectorBox(listing: Pick<Listing, "title" | "watch_category" | "language">): boolean {
  if (listing.watch_category !== MTG_HOBBIT_CATEGORY || listing.language !== "english") return false;
  const title = fold(listing.title);
  if (!/\bhobbit\b/.test(title) || !title.includes("collector booster")) return false;
  if (/\b(omega|play booster|bundle|commander|deck|single|individual|loose|opened|open box|spanish|espanol|japanese)\b/.test(title)) return false;
  return /\b(box|display)\b/.test(title) || /\b12\s*(collector\s*)?boosters?\b/.test(title) || /\b12\s*packs?\b/.test(title);
}

export function hasMtgHobbitBoxEvidence(listing: Pick<Listing, "title" | "evidence">): boolean {
  const evidence = fold(listing.evidence);
  if (/\b(not stated|not confirmed|unconfirmed|unknown|cannot confirm|can t confirm)\b/.test(evidence)) return false;
  const sealed = /\b(factory sealed|factory sealed box|sealed)\b/.test(evidence);
  const twelveBoosters = /\b12\s*(collector\s*)?(booster\s*)?packs?\b/.test(evidence) || /\b12\s*(collector\s*)?boosters?\b/.test(evidence);
  return sealed && twelveBoosters;
}

export type MtgDealClassification = "Exceptional / near-MSRP" | "Excellent Buy" | "Good Deal" |
  "Acceptable / Availability Opportunity" | "Market-ish" | "Poor Value" | "Price Unconfirmed";

export function mtgHobbitDealClassification(priceMxn: number | null): MtgDealClassification {
  if (priceMxn == null) return "Price Unconfirmed";
  if (priceMxn <= 8_500) return "Exceptional / near-MSRP";
  if (priceMxn <= 10_500) return "Excellent Buy";
  if (priceMxn <= 12_500) return "Good Deal";
  if (priceMxn <= 14_000) return "Acceptable / Availability Opportunity";
  if (priceMxn <= 15_000) return "Market-ish";
  return "Poor Value";
}

export function isMtgHobbitAlertable(listing: Listing): boolean {
  return isMtgHobbitCollectorBox(listing) && hasMtgHobbitBoxEvidence(listing) && listing.status === "available" &&
    listing.price_mxn != null && listing.price_mxn <= 14_000;
}
