import type {Env} from './types';
import {UUID_PATTERN} from './inventory-identities';
import {catchHuntSnapshot,boardHeaders} from './board';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export async function inventoryDiagnostics(env:Env,id:string) {
  if(!UUID_PATTERN.test(id))return {error:'Enter a complete diagnostic UUID.'};
  const identity=await env.SPAWN_DB.prepare('SELECT * FROM inventory_diagnostic_ids WHERE diagnostic_id=?').bind(id).first<{source:string;source_key:string}>();
  if(!identity)return {error:'Diagnostic ID not found.'};
  const listing=await env.SPAWN_DB.prepare(identity.source==='inventory'?'SELECT * FROM inventory WHERE listing_key=?':'SELECT * FROM inventory WHERE canonical_url=(SELECT product_url FROM amazon_watchlist WHERE asin=?)').bind(identity.source_key).first<Record<string,unknown>>();
  const asin=identity.source==='amazon'?identity.source_key:String(listing?.retailer_sku??'');
  const [watch,decisions,attempts,revalidation,candidates,observations,hunt]=await Promise.all([
    env.SPAWN_DB.prepare('SELECT asin,product_name,canonical_product_id,product_url,language,lifecycle_status,source,evidence,approved_by,approved_at FROM amazon_watchlist WHERE asin=?').bind(asin).first(),
    env.SPAWN_DB.prepare('SELECT * FROM amazon_catalog_decisions WHERE asin=? ORDER BY id DESC LIMIT 20').bind(asin).all(),
    env.SPAWN_DB.prepare('SELECT * FROM inventory_revalidation_attempts WHERE listing_key=? ORDER BY finished_at DESC LIMIT 20').bind(listing?.listing_key??'').all(),
    env.SPAWN_DB.prepare('SELECT * FROM inventory_revalidation_state WHERE listing_key=?').bind(listing?.listing_key??'').first(),
    env.SPAWN_DB.prepare('SELECT candidate_id,status,source,product_type,language,reviewed_by,reviewed_at,published_at FROM monitoring_candidates WHERE source_listing_key=? ORDER BY discovered_at DESC LIMIT 20').bind(listing?.listing_key??'').all(),
    env.SPAWN_DB.prepare('SELECT * FROM catch_inventory_observations WHERE asin=? ORDER BY observed_at DESC LIMIT 20').bind(asin).all(),
    /^[A-Z0-9]{10}$/.test(asin)?catchHuntSnapshot(env):Promise.resolve(null)
  ]);
  return {identity,listing,watch,inventory_approvals:candidates.results,catch_decisions:decisions.results,revalidation,attempts:attempts.results,
    catch_observations:observations.results,catch_monitor:hunt?.rows.find(r=>r.asin===asin)??null,catch_feed_available:hunt?.available??null,catch_catalog:hunt?.catalog??null,
    refresh_enabled:env.INVENTORY_REVALIDATION_ENABLED==='true'};
}
export function diagnosticsPage(id:string,data:unknown,token:string) {
  return new Response(`<!doctype html><html><head><title>Inventory diagnostics</title><style>body{font:16px system-ui;background:#111820;color:#eef2f5;padding:24px}input{width:min(90%,420px);padding:12px}button{padding:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#c6f369}</style></head><body><h1>Inventory diagnostics</h1><form method="get"><input type="hidden" name="access" value="${esc(token)}"><label>Diagnostic UUID <input name="id" value="${esc(id)}" placeholder="Paste a diagnostic UUID" required></label><button>Look up entry</button></form><pre>${data?esc(JSON.stringify(data,null,2)):''}</pre></body></html>`,{headers:boardHeaders()});
}
