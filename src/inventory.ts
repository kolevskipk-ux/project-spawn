import type { ChangeType, Env, InventoryChange, Listing } from "./types";
import { normalizeVendor, normalizedCandidate, printSeries, suppressedVendorKeys } from "./garfield";
import { catalogProductId } from "./catalog";

interface InventoryRow {
  listing_key: string;
  canonical_url: string;
  status: Listing["status"];
  availability_state?: Listing["availability_state"];
  price_mxn: number | null;
}

export const D1_SAFE_VARIABLE_LIMIT = 90;

const INVENTORY_COLUMNS = [
  "listing_key", "canonical_url", "retailer", "title", "watch_category", "retailer_sku", "first_seen_at", "last_seen_at",
  "status", "availability_state", "price_mxn", "language", "language_evidence", "msrp_mxn", "msrp_source_url",
  "last_change_type", "print_series", "product_id"
] as const;

const OBSERVATION_COLUMNS = [
  "scan_id", "listing_key", "observed_at", "status", "price_mxn", "language", "msrp_mxn", "change_type", "evidence"
] as const;

export function d1RowsPerStatement(bindingsPerRow: number): number {
  if (!Number.isInteger(bindingsPerRow) || bindingsPerRow < 1) throw new Error("bindingsPerRow must be a positive integer");
  return Math.max(1, Math.floor(D1_SAFE_VARIABLE_LIMIT / bindingsPerRow));
}

export const D1_MULTI_ROW_BATCHES = {
  inventory: { bindingsPerRow: INVENTORY_COLUMNS.length, rowsPerStatement: d1RowsPerStatement(INVENTORY_COLUMNS.length) },
  inventoryObservations: { bindingsPerRow: OBSERVATION_COLUMNS.length, rowsPerStatement: d1RowsPerStatement(OBSERVATION_COLUMNS.length) }
} as const;

export function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    const parameterKeys: string[] = [];
    url.searchParams.forEach((_value, key) => parameterKeys.push(key));
    for (const key of parameterKeys) {
      if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    if (/\/en\/products\//i.test(url.pathname)) url.pathname = url.pathname.replace(/^\/en\/products\//i, "/products/");
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function amazonAsin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/(^|\.)amazon\.com\.mx$/i.test(url.hostname)) return null;
    return url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase() ?? null;
  } catch { return null; }
}

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function classifyListing(previous: InventoryRow | undefined, listing: Listing, baseline: boolean): ChangeType {
  if (baseline) return "baseline";
  if (previous?.availability_state === "preorder_placeholder" && listing.availability_state !== "preorder_placeholder") return "preorder_open";
  if (listing.status !== "available") return "unchanged";
  if (!previous || previous.status === "unknown") return "new";
  if (previous.status === "sold_out") return "restock";
  if (listing.price_mxn != null && previous.price_mxn != null) {
    const reduction = previous.price_mxn - listing.price_mxn;
    if (reduction >= 100 || reduction / previous.price_mxn >= 0.05) return "price_drop";
  }
  return "unchanged";
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export async function updateInventory(env: Env, scanId: string, listings: Listing[], observedAt: string): Promise<{ baseline: boolean; changes: InventoryChange[]; discoveries: InventoryChange[] }> {
  const suppressed = await suppressedVendorKeys(env);
  const rawPrepared = await Promise.all(listings.filter(listing => !suppressed.has(normalizeVendor(listing.retailer))).map(async (listing) => {
    const canonicalUrl = canonicalizeUrl(listing.url);
    return { listing, canonicalUrl, listingKey: await hash(canonicalUrl) };
  }));
  const uniquePrepared = new Map<string, (typeof rawPrepared)[number]>();
  for (const item of rawPrepared) {
    const existing = uniquePrepared.get(item.listingKey);
    if (!existing || (existing.listing.status !== "available" && item.listing.status === "available") ||
      (existing.listing.price_mxn == null && item.listing.price_mxn != null)) uniquePrepared.set(item.listingKey, item);
  }
  const prepared = [...uniquePrepared.values()];
  const state = await env.SPAWN_DB.prepare("SELECT value FROM worker_state WHERE key = 'inventory_initialized'").first<{ value: string }>();
  const baseline = !state;
  const keys = prepared.map((item) => item.listingKey);
  const previous = new Map<string, InventoryRow>();
  for (const group of chunks(keys, 25)) {
    if (!group.length) continue;
    const rows = await env.SPAWN_DB.prepare(`SELECT listing_key, canonical_url, status, availability_state, price_mxn FROM inventory WHERE listing_key IN (${group.map(() => "?").join(",")})`)
      .bind(...group).all<InventoryRow>();
    for (const row of rows.results) previous.set(row.listing_key, row);
  }

  const changes = prepared.map((item) => ({
    listingKey: item.listingKey,
    type: classifyListing(previous.get(item.listingKey), item.listing, baseline),
    previousPrice: previous.get(item.listingKey)?.price_mxn ?? null,
    listing: item.listing
  }));
  const discoveries = baseline ? [] : changes.filter((change) => !previous.has(change.listingKey));

  const statements: D1PreparedStatement[] = [];
  for (const group of chunks(prepared, D1_MULTI_ROW_BATCHES.inventory.rowsPerStatement)) {
    const values = group.map(() => `(${INVENTORY_COLUMNS.map(() => "?").join(", ")})`).join(",");
    const bindings = group.flatMap((item) => {
      const change = changes.find((candidate) => candidate.listingKey === item.listingKey)!;
      const old = previous.get(item.listingKey);
      const trustedStatus = item.listing.status === "unknown" && old ? old.status : item.listing.status;
      return [item.listingKey, item.canonicalUrl, item.listing.retailer, item.listing.title, item.listing.watch_category, item.listing.retailer_sku, observedAt, observedAt, trustedStatus,
        item.listing.availability_state ?? item.listing.status, item.listing.availability_state === "preorder_placeholder" ? null : item.listing.price_mxn, item.listing.language, item.listing.language_evidence, item.listing.msrp_mxn, item.listing.msrp_source_url, change.type, printSeries(item.listing.watch_category), catalogProductId(item.listing)];
    });
    statements.push(env.SPAWN_DB.prepare(`INSERT INTO inventory
      (${INVENTORY_COLUMNS.join(", ")})
      VALUES ${values}
      ON CONFLICT(listing_key) DO UPDATE SET canonical_url=excluded.canonical_url, retailer=excluded.retailer, title=excluded.title,
      watch_category=excluded.watch_category, retailer_sku=COALESCE(excluded.retailer_sku, inventory.retailer_sku),
      last_seen_at=excluded.last_seen_at, status=excluded.status, availability_state=excluded.availability_state,
      price_mxn=CASE WHEN excluded.availability_state='preorder_placeholder' THEN inventory.price_mxn ELSE COALESCE(excluded.price_mxn, inventory.price_mxn) END,
      language=excluded.language, language_evidence=excluded.language_evidence, msrp_mxn=excluded.msrp_mxn,
      msrp_source_url=excluded.msrp_source_url, last_change_type=excluded.last_change_type, print_series=excluded.print_series,
      product_id=COALESCE(excluded.product_id, inventory.product_id)`).bind(...bindings));
  }
  for (const group of chunks(changes, D1_MULTI_ROW_BATCHES.inventoryObservations.rowsPerStatement)) {
    const values = group.map(() => `(${OBSERVATION_COLUMNS.map(() => "?").join(", ")})`).join(",");
    const bindings = group.flatMap((change) => [scanId, change.listingKey, observedAt, change.listing.status, change.listing.price_mxn,
      change.listing.language, change.listing.msrp_mxn, change.type, change.listing.evidence]);
    statements.push(env.SPAWN_DB.prepare(`INSERT INTO inventory_observations
      (${OBSERVATION_COLUMNS.join(", ")}) VALUES ${values}`).bind(...bindings));
  }
  statements.push(env.SPAWN_DB.prepare("INSERT INTO worker_state (key, value, updated_at) VALUES ('inventory_initialized', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(JSON.stringify({ scan_id: scanId, listings: prepared.length }), observedAt));
  statements.push(env.SPAWN_DB.prepare(`UPDATE inventory SET product_id=(SELECT p.id FROM products p WHERE lower(trim(p.canonical_name))=lower(trim(inventory.title)) AND p.watch_category=inventory.watch_category LIMIT 1) WHERE product_id IS NULL`));
  for (const item of prepared) {
    const asin = amazonAsin(item.canonicalUrl);
    if (!asin) continue;
    statements.push(env.SPAWN_DB.prepare(`INSERT INTO amazon_watchlist
      (asin,product_name,product_url,watch_category,language,priority,lane,lifecycle_status,source,evidence,first_discovered_at,last_discovered_at,updated_at)
      VALUES(?,?,?,?,?,'HIGH','normal','DISCOVERED','spawn_discovery',?,?,?,?)
      ON CONFLICT(asin) DO UPDATE SET
      product_name=CASE WHEN amazon_watchlist.lifecycle_status='DISCOVERED' THEN excluded.product_name ELSE amazon_watchlist.product_name END,
      product_url=CASE WHEN amazon_watchlist.lifecycle_status='DISCOVERED' THEN excluded.product_url ELSE amazon_watchlist.product_url END,
      watch_category=CASE WHEN amazon_watchlist.lifecycle_status='DISCOVERED' THEN excluded.watch_category ELSE amazon_watchlist.watch_category END,
      language=CASE WHEN amazon_watchlist.lifecycle_status='DISCOVERED' THEN excluded.language ELSE amazon_watchlist.language END,
      evidence=excluded.evidence,last_discovered_at=excluded.last_discovered_at,updated_at=excluded.updated_at`)
      .bind(asin,item.listing.title,item.canonicalUrl,item.listing.watch_category,item.listing.language,item.listing.evidence,observedAt,observedAt,observedAt));
  }
  if (statements.length) await env.SPAWN_DB.batch(statements);
  for (const item of prepared) {
    const candidate = normalizedCandidate({ ...item.listing, url:item.canonicalUrl }, item.listingKey);
    if (candidate) await env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO monitoring_candidates
      (candidate_id,source,source_url,source_listing_key,vendor,vendor_key,product_name,product_family,print_series,product_type,language,retailer_sku,observed_price_mxn,availability_state,discovered_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(candidate.candidate_id,candidate.source,candidate.source_url,candidate.source_listing_key,candidate.vendor,candidate.vendor_key,candidate.product_name,candidate.product_family,candidate.print_series,candidate.product_type,candidate.language,candidate.retailer_sku,candidate.observed_price_mxn,candidate.availability_state,observedAt).run();
  }
  return { baseline, changes, discoveries };
}
