import type { Listing } from "./types";
import { isMtgHobbitCollectorBox, MTG_HOBBIT_PRODUCT_ID } from "./mtg";

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();

function legacyEnglishProductId(listing: Pick<Listing, "title" | "watch_category" | "language">): string | null {
  if (isMtgHobbitCollectorBox(listing)) return MTG_HOBBIT_PRODUCT_ID;
  if (listing.language !== "english") return null;
  const title = fold(listing.title);
  const prefix = listing.watch_category === "ascended_heroes" ? "ah-en" : listing.watch_category === "30th_celebration" ? "30-en" : listing.watch_category === "delta_reign" ? "delta-reign-en" : null;
  if (!prefix) return null;
  if (title.includes("elite trainer box")) return `${prefix}-etb`;
  if (title.includes("booster bundle")) return `${prefix}-booster-bundle`;
  if (listing.watch_category === "delta_reign" && (title.includes("three booster blister") || title.includes("3 booster blister"))) return "delta-reign-en-three-booster-blister";
  if (listing.watch_category === "delta_reign" && title.includes("build battle box")) return "delta-reign-en-build-battle-box";
  if (title.includes("tech sticker collection")) return `${prefix}-tech-sticker`;
  if (listing.watch_category === "30th_celebration" && title.includes("binder collection")) return "30-en-binder";
  if (listing.watch_category === "30th_celebration" && title.includes("ultra premium collection")) {
    if (/\bday\b/.test(title)) return "30-en-upc-day";
    if (/\bnight\b/.test(title)) return "30-en-upc-night";
  }
  if (listing.watch_category === "ascended_heroes") {
    if (title.includes("mega emboar ex box")) return "ah-en-mega-emboar";
    if (title.includes("mega feraligatr ex box")) return "ah-en-mega-feraligatr";
    if (title.includes("mega meganium ex box")) return "ah-en-mega-meganium";
    if (title.includes("premium poster collection")) return "ah-en-poster";
  }
  if (listing.watch_category === "30th_celebration" && title.includes("poster collection")) return "30-en-poster";
  return null;
}

// Existing IDs are stable; other languages never reuse the English pricing identity.
export function catalogProductId(listing: Pick<Listing, "title" | "watch_category" | "language">): string | null {
  if (listing.language === "unknown" || listing.language === "other") return null;
  const code:Record<string,string>={english:"en",spanish:"es",bilingual:"bi",japanese:"ja",chinese:"zh",korean:"ko",french:"fr",german:"de",italian:"it",portuguese:"pt"};
  if (!code[listing.language]) return null;
  // Hobbit's legacy title rules stay conservative; administrators can resolve other variants.
  if (listing.watch_category === "mtg_hobbit_collector_box" && listing.language !== "english") return null;
  const id=legacyEnglishProductId({...listing,language:"english"});
  return id?.replace("-en-", "-"+code[listing.language]+"-") ?? null;
}
