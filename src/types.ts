export interface Env {
  SPAWN_DB: D1Database;
  OPENAI_API_KEY: string;
  DISCORD_WEBHOOK_URL: string;
  RUN_TOKEN: string;
  OPENAI_MODEL: string;
  SPAWN_TIMEZONE: string;
  SPAWN_CONFIG_VERSION: string;
  PUBLIC_BASE_URL: string;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
}

export interface Listing {
  title: string;
  watch_category: "30th_celebration" | "ascended_heroes";
  retailer: string;
  retailer_sku: string | null;
  url: string;
  status: "available" | "sold_out" | "unknown";
  price_mxn: number | null;
  language: "english" | "spanish" | "bilingual" | "japanese" | "unknown";
  language_evidence: string;
  msrp_mxn: number | null;
  msrp_source_url: string | null;
  evidence: string;
}

export type ChangeType = "baseline" | "new" | "restock" | "price_drop" | "unchanged";

export interface InventoryChange {
  listingKey: string;
  type: ChangeType;
  previousPrice: number | null;
  listing: Listing;
}

export interface ScanResult {
  summary: string;
  sources_scanned: number;
  listings_evaluated: number;
  available: number;
  sold_out: number;
  unknown: number;
  changes: string[];
  listings: Listing[];
}
