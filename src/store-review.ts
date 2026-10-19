import type {Env} from './types';
import {storeSuppressed,type Store} from './store-catalog';

export const STORE_PAGE_SIZE=25;
// Cursor ranges use existing primary/unique keys; never OFFSET or per-card counts.
export const storeQueueSql=`SELECT * FROM store_acquisitions WHERE status=? AND id>? ORDER BY id LIMIT 26`;
export const storeProductsSql=`WITH catalog AS MATERIALIZED (
 SELECT url FROM store_catalog_items WHERE store_id=? AND url>? ORDER BY url LIMIT 26
), known AS MATERIALIZED (
 SELECT canonical_url url FROM inventory WHERE canonical_url>=? AND canonical_url<? AND canonical_url>?
 ORDER BY canonical_url LIMIT 26
), page AS (SELECT url FROM catalog UNION SELECT url FROM known ORDER BY url LIMIT 26)
SELECT p.url,COALESCE(c.title,i.title) title,COALESCE(c.category,i.watch_category) category,c.listing_json,
 COALESCE(c.evidence_note,'Existing inventory; audit evidence may be unavailable') evidence_note,
 COALESCE(c.last_seen_at,i.last_seen_at) last_seen_at,c.imported_at,COALESCE(c.listing_key,i.listing_key) listing_key,
 r.decision,r.revision review_revision,t.state monitored_state,t.price_mxn monitored_price,t.last_observed_at,t.last_attempt_at,t.failures,
 c.last_seen_at catalog_seen_at,COALESCE(i.availability_observed_at,i.last_seen_at) inventory_observed_at,
 i.status inventory_state,i.price_mxn inventory_price,a.removed_at
FROM page p LEFT JOIN store_catalog_items c ON c.store_id=? AND c.url=p.url
LEFT JOIN store_item_reviews r ON r.store_id=? AND r.url=p.url
LEFT JOIN store_monitor_targets t ON t.store_id=? AND t.url=p.url
LEFT JOIN inventory i ON i.canonical_url=p.url
LEFT JOIN inventory_admin_reviews a ON a.listing_key=i.listing_key
ORDER BY p.url LIMIT 26`;

export async function reviewStoreItem(env:Env,storeId:string,url:string,revision:number,action:string,actor:string){
 if(!['approve_item','reject_item'].includes(action)||!Number.isSafeInteger(revision)||revision<0||!actor)throw Error('Invalid item decision');
 const store=await env.SPAWN_DB.prepare('SELECT * FROM store_acquisitions WHERE id=?').bind(storeId).first<Store>();
 if(!store||store.marketplace||['REJECTED','PAUSED'].includes(store.status)||await storeSuppressed(env,store))throw Error('Store is unavailable or requires seller-specific review');
 let parsed:URL;try{parsed=new URL(url);}catch{throw Error('Invalid product URL');}
 if(parsed.origin!==store.origin||parsed.href!==url)throw Error('Product does not belong to this store');
 const catalog=await env.SPAWN_DB.prepare('SELECT listing_json FROM store_catalog_items WHERE store_id=? AND url=?').bind(storeId,url).first<{listing_json:string|null}>();
 const inventory=await env.SPAWN_DB.prepare('SELECT listing_key FROM inventory WHERE canonical_url=?').bind(url).first<{listing_key:string}>();
 if(!catalog&&!inventory)throw Error('Product not found in this store');
 if(action==='approve_item'&&!catalog?.listing_json&&!inventory)throw Error('Product needs identity evidence before approval');
 const decision=action==='approve_item'?'APPROVED':'REJECTED',at=new Date().toISOString(),audit=crypto.randomUUID();
 const statements=[
  env.SPAWN_DB.prepare(`INSERT INTO store_item_reviews(store_id,url,decision,revision,actor,reviewed_at)
   SELECT ?,?,?,1,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM store_item_reviews WHERE store_id=? AND url=? AND revision=?)) AND EXISTS(SELECT 1 FROM store_acquisitions WHERE id=? AND revision=? AND status IN ('PENDING','APPROVED'))
   ON CONFLICT(store_id,url) DO UPDATE SET decision=excluded.decision,revision=store_item_reviews.revision+1,actor=excluded.actor,reviewed_at=excluded.reviewed_at
   WHERE store_item_reviews.revision=? AND EXISTS(SELECT 1 FROM store_acquisitions WHERE id=? AND revision=? AND status IN ('PENDING','APPROVED'))`)
   .bind(storeId,url,decision,actor,at,revision,storeId,url,revision,storeId,store.revision,revision,storeId,store.revision),
  env.SPAWN_DB.prepare(`INSERT INTO store_acquisition_decisions(id,store_id,action,actor,decided_at,revision,details_json)
   SELECT ?,?,?,?,?,?,? WHERE changes()=1`).bind(audit,storeId,action,actor,at,store.revision+1,JSON.stringify({url,decision,itemRevision:revision+1})),
  // Invalidate in-flight import approval snapshots without changing the store policy.
  env.SPAWN_DB.prepare('UPDATE store_acquisitions SET revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM store_acquisition_decisions WHERE id=?)').bind(storeId,audit)
 ];
 // Existing inventory visibility is governed by its reviewed removal state. Keep
 // history and stock intact; approving does not undo another workflow's removal.
 if(inventory){
  const marker='store-item:'+actor;
  statements.push(
   env.SPAWN_DB.prepare(`INSERT INTO inventory_admin_reviews(listing_key,revision,reviewed_at,reviewed_by,removed_at)
    SELECT ?,1,?,?,? WHERE EXISTS(SELECT 1 FROM store_item_reviews WHERE store_id=? AND url=? AND revision=? AND decision=?) AND EXISTS(SELECT 1 FROM store_acquisition_decisions WHERE id=?)
    ON CONFLICT(listing_key) DO UPDATE SET revision=inventory_admin_reviews.revision+1,reviewed_at=excluded.reviewed_at,
    reviewed_by=excluded.reviewed_by,removed_at=excluded.removed_at
    WHERE (?='REJECTED' AND (inventory_admin_reviews.removed_at IS NULL OR inventory_admin_reviews.reviewed_by LIKE 'store-item:%'))
       OR (?='APPROVED' AND inventory_admin_reviews.reviewed_by LIKE 'store-item:%')`)
    .bind(inventory.listing_key,at,marker,decision==='REJECTED'?at:null,storeId,url,revision+1,decision,audit,decision,decision),
   env.SPAWN_DB.prepare(`INSERT INTO inventory_admin_actions(id,listing_key,action,actor,acted_at,revision,details_json)
    SELECT ?,?,?,?,?,revision,? FROM inventory_admin_reviews WHERE listing_key=? AND changes()=1`)
    .bind(crypto.randomUUID(),inventory.listing_key,decision==='REJECTED'?'remove':'restore',actor,at,JSON.stringify({source:'store-item-review',storeId,url}),inventory.listing_key)
  );
 }
 const results=await env.SPAWN_DB.batch(statements);
 if(!results[0].meta.changes)throw Error('Item changed; reload before deciding');
 return {decision,revision:revision+1};
}
