export interface Env {
  SPAWN_DB: D1Database;
  OPENAI_API_KEY: string;
  DISCORD_WEBHOOK_URL: string;
  RUN_TOKEN: string;
  OPENAI_MODEL: string;
  SPAWN_TIMEZONE: string;
  SPAWN_CONFIG_VERSION: string;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp?: string };
}

export interface Listing {
  title: string;
  retailer: string;
  url: string;
  status: "available" | "sold_out" | "unknown";
  price_mxn: number | null;
  evidence: string;
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

