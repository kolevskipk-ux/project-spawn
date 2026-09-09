import type {Env} from './types';
export const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function inventoryIdentities(env:Env) {
  const rows=await env.SPAWN_DB.prepare(`SELECT w.asin,t.diagnostic_id target_diagnostic_id,
    d.diagnostic_id inventory_diagnostic_id,i.listing_key,w.canonical_product_id,w.lifecycle_status
    FROM amazon_watchlist w JOIN inventory_diagnostic_ids t ON t.source='amazon' AND t.source_key=w.asin
    LEFT JOIN inventory i ON i.canonical_url=w.product_url
    LEFT JOIN inventory_diagnostic_ids d ON d.source='inventory' AND d.source_key=i.listing_key
    WHERE w.lifecycle_status='PUBLISHED' ORDER BY w.asin`).all();
  return {schema_version:1,source_owner:'spawn',identities:rows.results};
}
