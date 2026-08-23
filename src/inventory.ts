import type { ChangeType, Env, InventoryChange, Listing } from "./types";

interface InventoryRow {
  listing_key: string;
  canonical_url: string;
  status: Listing["status"];
  price_mxn: number | null;
}

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

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function classifyListing(previous: InventoryRow | undefined, listing: Listing, baseline: boolean): ChangeType {
  if (baseline) return "baseline";
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

export async function updateInventory(env: Env, scanId: string, listings: Listing[], observedAt: string): Promise<{ baseline: boolean; changes: InventoryChange[] }> {
  const rawPrepared = await Promise.all(listings.map(async (listing) => {
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
    const rows = await env.SPAWN_DB.prepare(`SELECT listing_key, canonical_url, status, price_mxn FROM inventory WHERE listing_key IN (${group.map(() => "?").join(",")})`)
      .bind(...group).all<InventoryRow>();
    for (const row of rows.results) previous.set(row.listing_key, row);
  }

  const changes = prepared.map((item) => ({
    listingKey: item.listingKey,
    type: classifyListing(previous.get(item.listingKey), item.listing, baseline),
    previousPrice: previous.get(item.listingKey)?.price_mxn ?? null,
    listing: item.listing
  }));

  const statements: D1PreparedStatement[] = [];
  for (const group of chunks(prepared, 6)) {
    const values = group.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const bindings = group.flatMap((item) => {
      const change = changes.find((candidate) => candidate.listingKey === item.listingKey)!;
      const old = previous.get(item.listingKey);
      const trustedStatus = item.listing.status === "unknown" && old ? old.status : item.listing.status;
      return [item.listingKey, item.canonicalUrl, item.listing.retailer, item.listing.title, item.listing.watch_category, item.listing.retailer_sku, observedAt, observedAt, trustedStatus,
        item.listing.price_mxn, item.listing.language, item.listing.language_evidence, item.listing.msrp_mxn, item.listing.msrp_source_url, change.type];
    });
    statements.push(env.SPAWN_DB.prepare(`INSERT INTO inventory
      (listing_key, canonical_url, retailer, title, watch_category, retailer_sku, first_seen_at, last_seen_at, status, price_mxn, language, language_evidence, msrp_mxn, msrp_source_url, last_change_type)
      VALUES ${values}
      ON CONFLICT(listing_key) DO UPDATE SET canonical_url=excluded.canonical_url, retailer=excluded.retailer, title=excluded.title,
      watch_category=excluded.watch_category, retailer_sku=COALESCE(excluded.retailer_sku, inventory.retailer_sku),
      last_seen_at=excluded.last_seen_at, status=excluded.status, price_mxn=COALESCE(excluded.price_mxn, inventory.price_mxn),
      language=excluded.language, language_evidence=excluded.language_evidence, msrp_mxn=excluded.msrp_mxn,
      msrp_source_url=excluded.msrp_source_url, last_change_type=excluded.last_change_type`).bind(...bindings));
  }
  for (const group of chunks(changes, 8)) {
    const values = group.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const bindings = group.flatMap((change) => [scanId, change.listingKey, observedAt, change.listing.status, change.listing.price_mxn,
      change.listing.language, change.listing.msrp_mxn, change.type, change.listing.evidence]);
    statements.push(env.SPAWN_DB.prepare(`INSERT INTO inventory_observations
      (scan_id, listing_key, observed_at, status, price_mxn, language, msrp_mxn, change_type, evidence) VALUES ${values}`).bind(...bindings));
  }
  statements.push(env.SPAWN_DB.prepare("INSERT INTO worker_state (key, value, updated_at) VALUES ('inventory_initialized', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(JSON.stringify({ scan_id: scanId, listings: prepared.length }), observedAt));
  if (statements.length) await env.SPAWN_DB.batch(statements);
  return { baseline, changes };
}
