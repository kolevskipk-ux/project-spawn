export interface Env {
  SPAWN_DB: D1Database;
  OPENAI_API_KEY: string;
  RUN_TOKEN: string;
  OPENAI_MODEL: string;
  SPAWN_TIMEZONE: string;
  SPAWN_CONFIG_VERSION: string;
  SPAWN_QUIET_START?: string;
  SPAWN_QUIET_END?: string;
  PUBLIC_BASE_URL: string;
  BOARD_ACCESS_TOKEN: string;
  CATCH_INGEST_SECRET?: string;
  CATCH_MONITOR_ENDPOINT?: string;
  OPS_DISCORD_WEBHOOK_URL?: string;
  APPROVAL_DISCORD_ROLE_ID?: string;
  PUBLIC_RATE_LIMIT?: RateLimit;
  FEEDBACK_RATE_LIMIT?: RateLimit;
  MANUAL_RATE_LIMIT?: RateLimit;
  INGEST_RATE_LIMIT?: RateLimit;
  INVENTORY_REVALIDATION_ENABLED?: string;
  INVENTORY_REVALIDATION_BATCH_SIZE?: string;
  INVENTORY_REVALIDATION_TARGET_HOURS?: string;
  INVENTORY_FRESHNESS_HOURS?: string;
  AMAZON_ENRICHMENT_ENABLED?: string;
  AMAZON_ENRICHMENT_BATCH_SIZE?: string;
  SEED_VERIFICATION_ENABLED?: string;
  SEED_VERIFICATION_BATCH_SIZE?: string;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
}

export interface Listing {
  title: string;
  watch_category: "30th_celebration" | "ascended_heroes" | "delta_reign" | "mtg_hobbit_collector_box";
  retailer: string;
  retailer_sku: string | null;
  url: string;
  status: "available" | "sold_out" | "unknown";
  availability_state?: "available" | "sold_out" | "unknown" | "preorder_placeholder";
  price_mxn: number | null;
  language: "english" | "spanish" | "bilingual" | "japanese" | "chinese" | "unknown";
  language_evidence: string;
  msrp_mxn: number | null;
  msrp_source_url: string | null;
  evidence: string;
}

export type ChangeType = "baseline" | "new" | "restock" | "preorder_open" | "price_drop" | "unchanged";

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
