import {shopifyProductSchema} from './product-page-evidence';
import type {Env,Listing} from './types';
import {normalizeVendor,printSeries} from './garfield';
import {canonicalizeUrl} from './inventory';
import {targetInsert} from './store-monitoring';
import {STORE_POLICY} from './store-catalog-parser';
import {storeSuppressionSql} from './store-visibility-query';
import {catalogOrigin,catalogUrl,catalogProduct,candidateCatalogUrl,catalogCategory,marketplaceOrigin,parseRobots,robotsAllows,sitemapLinks,STORE_CATEGORIES,type RobotsPolicy} from './store-catalog-parser';

export type Store={id:string;origin:string;retailer:string;vendor_key:string;marketplace:number;status:string;revision:number;categories_json:string;refresh_hours:number;approved_by:string|null;approved_at:string|null;baseline_completed_at:string|null;next_due_at:string|null};
type Run={id:string;store_id:string;status:string;robots_json:string;started_at:string;note:string};
const MAX_PAGES=25000, PAGES_PER_TICK=24;
export const storeDigest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function storeSuppressed(env:Env,store:Store) {
  const suppressed=(await env.SPAWN_DB.prepare("SELECT vendor_key FROM vendors WHERE status='SUPPRESSED'").all<{vendor_key:string}>()).results;
  if(suppressed.some(v=>v.vendor_key===store.vendor_key))return true;
  // Aliases on the same origin cannot bypass an existing vendor suppression.
  const aliases=(await env.SPAWN_DB.prepare('SELECT DISTINCT retailer FROM inventory WHERE canonical_url LIKE ?').bind(store.origin+'/%').all<{retailer:string}>()).results;
  return aliases.some(a=>suppressed.some(v=>v.vendor_key===normalizeVendor(a.retailer)));
}
export async function auditKnownStores(env:Env,now=new Date()) {
  const rows=(await env.SPAWN_DB.prepare('SELECT canonical_url,retailer FROM inventory ORDER BY first_seen_at,listing_key').all<{canonical_url:string;retailer:string}>()).results;
  const seen=new Set<string>();let added=0,unsupported=0;
  for(const row of rows) {
    const origin=catalogOrigin(row.canonical_url);if(!origin){unsupported++;continue;}if(seen.has(origin))continue;seen.add(origin);
    const result=await env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO store_acquisitions(id,origin,retailer,vendor_key,marketplace,created_at) VALUES(?,?,?,?,?,?)`)
      .bind(await storeDigest(origin),origin,row.retailer,normalizeVendor(row.retailer),Number(marketplaceOrigin(origin)),now.toISOString()).run();
    added+=result.meta.changes;
  }
  return {stores:seen.size,added,unsupported};
}
// Philip's existing-item policy applies to retailer origins, never entire marketplaces.
export const adminApprovedStoreEvidence=`EXISTS(SELECT 1 FROM monitoring_candidates c WHERE c.source_url LIKE s.origin||'/%' AND c.status='ACCEPTED' AND c.published_at IS NOT NULL AND c.reviewed_by IS NOT NULL AND trim(c.reviewed_by)<>'' AND c.reviewed_by NOT LIKE 'auto:%')`;
export async function approveStoresWithAdminInventory(env:Env) {
  if(env.STORE_ADMIN_ITEM_APPROVAL_ENABLED!=='true')return 0;
  const stores=(await env.SPAWN_DB.prepare(`SELECT s.* FROM store_acquisitions s WHERE s.status='PENDING' AND s.marketplace=0 AND ${adminApprovedStoreEvidence} AND NOT ${storeSuppressionSql} ORDER BY s.id LIMIT 10`).all<Store>()).results;
  let approved=0;
  for(const store of stores){
    if(await storeSuppressed(env,store))continue;
    const at=new Date().toISOString(),decisionId=crypto.randomUUID();
    const result=await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare(`UPDATE store_acquisitions AS s SET status='APPROVED',revision=revision+1,categories_json=?,refresh_hours=6,approved_by='auto:admin-item-policy',approved_at=?,policy_json=?,next_due_at=NULL WHERE id=? AND revision=? AND status='PENDING' AND marketplace=0 AND ${adminApprovedStoreEvidence} AND NOT ${storeSuppressionSql}`).bind(JSON.stringify(STORE_CATEGORIES),at,JSON.stringify(STORE_POLICY),store.id,store.revision),
      env.SPAWN_DB.prepare(`INSERT INTO store_acquisition_decisions(id,store_id,action,actor,decided_at,revision,details_json) SELECT ?,?,'approve','auto:admin-item-policy',?,?,json_object('policy','existing-admin-approved-item','categories',json(?),'hours',6,'source_candidates',json((SELECT json_group_array(candidate_id) FROM monitoring_candidates WHERE source_url LIKE ? AND status='ACCEPTED' AND published_at IS NOT NULL AND reviewed_by IS NOT NULL AND trim(reviewed_by)<>'' AND reviewed_by NOT LIKE 'auto:%'))) WHERE changes()=1`).bind(decisionId,store.id,at,store.revision+1,JSON.stringify(STORE_CATEGORIES),store.origin+'/%')
    ]);
    approved+=result[0].meta.changes;
  }
  return approved;
}
async function enqueue(env:Env,run:Run,store:Store,urls:string[],kind:string) {
  const unique=[...new Set(urls.map(url=>catalogUrl(url,store.origin)).filter((url):url is string=>Boolean(url)))];
  for(let offset=0;offset<Math.min(unique.length,MAX_PAGES);offset+=50) {
    await env.SPAWN_DB.batch(unique.slice(offset,offset+50).map(url=>env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO store_catalog_pages(run_id,url,kind)
      SELECT ?,?,? WHERE (SELECT COUNT(*) FROM store_catalog_pages WHERE run_id=?) < ?`).bind(run.id,url,kind,run.id,MAX_PAGES)));
  }
  const count=await env.SPAWN_DB.prepare('SELECT COUNT(*) n FROM store_catalog_pages WHERE run_id=?').bind(run.id).first<{n:number}>();
  if((count?.n??0)>=MAX_PAGES)await env.SPAWN_DB.prepare("UPDATE store_catalog_runs SET note='Catalog page limit reached; coverage is partial' WHERE id=?").bind(run.id).run();
}
export async function queueApprovedStoreDiscovery(env:Env,candidateId:string,sourceUrl:string){
 const origin=catalogOrigin(sourceUrl);if(!origin)return false;
 const store=await env.SPAWN_DB.prepare("SELECT * FROM store_acquisitions WHERE origin=? AND status='APPROVED' AND marketplace=0").bind(origin).first<Store>();
 if(!store||await storeSuppressed(env,store))return false;
 const url=catalogUrl(sourceUrl,origin);if(!url)return false;
 if(await env.SPAWN_DB.prepare('SELECT 1 FROM store_discovery_handoffs WHERE candidate_id=? AND store_id=?').bind(candidateId,store.id).first())return true;
 const runId=await startCatalogRun(env,store.id,'approved-store-discovery');
 await env.SPAWN_DB.batch([
  env.SPAWN_DB.prepare("INSERT INTO store_catalog_pages(run_id,url,kind) VALUES(?,?,'PAGE') ON CONFLICT(run_id,url) DO UPDATE SET state=CASE WHEN store_catalog_pages.state='FAILED' THEN 'PENDING' ELSE store_catalog_pages.state END").bind(runId,url),
  env.SPAWN_DB.prepare("INSERT OR IGNORE INTO store_discovery_handoffs(candidate_id,store_id,url,queued_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM store_acquisitions WHERE id=? AND status='APPROVED' AND revision=?)").bind(candidateId,store.id,url,new Date().toISOString(),store.id,store.revision)
 ]);
 return true;
}
export async function startCatalogRun(env:Env,id:string,actor:string,now=new Date()) {
  const store=await env.SPAWN_DB.prepare('SELECT * FROM store_acquisitions WHERE id=?').bind(id).first<Store>();
  if(!store||store.marketplace||['REJECTED','PAUSED'].includes(store.status)||await storeSuppressed(env,store))throw new Error('Store is unavailable, suppressed, paused, or needs seller-specific marketplace support');
  const old=await env.SPAWN_DB.prepare("SELECT id FROM store_catalog_runs WHERE store_id=? AND status='RUNNING'").bind(id).first<{id:string}>();
  if(old)return old.id;
  const runId=crypto.randomUUID();
  await env.SPAWN_DB.batch([
    env.SPAWN_DB.prepare("INSERT INTO store_catalog_runs(id,store_id,status,started_at,started_by) VALUES(?,?,'RUNNING',?,?)").bind(runId,id,now.toISOString(),actor),
    env.SPAWN_DB.prepare("INSERT INTO store_catalog_pages(run_id,url,kind) VALUES(?,?,'ROBOTS')").bind(runId,store.origin+'/robots.txt'),
    env.SPAWN_DB.prepare('UPDATE store_acquisitions SET next_due_at=NULL WHERE id=?').bind(id)
  ]);
  return runId;
}
async function boundedFetch(url:string,fetchFn:typeof fetch,allows:(url:string)=>boolean) {
  let target=url,response:Response;
  const signal=AbortSignal.timeout(6000);
  for(let redirects=0;;redirects++){
    response=await fetchFn(target,{redirect:'manual',signal,headers:{'User-Agent':'GarfieldCatalog/1.0','Accept':'text/html,application/xml,application/json,text/plain'}});
    if(response.status<300||response.status>=400)break;
    const location=response.headers.get('location');await response.body?.cancel();
    if(!location||redirects>=2)throw new Error('Invalid or excessive redirects');
    target=new URL(location,target).href;
    if(catalogOrigin(target)!==catalogOrigin(url)||!allows(target))throw new Error('Redirect leaves approved origin or robots scope');
  }
  if(Number(response.headers.get('content-length'))>2_000_000)throw new Error('Page exceeds 2 MB limit');
  const reader=response.body?.getReader();if(!reader)return {status:response.status,text:''};
  const decoder=new TextDecoder();let text='',bytes=0;
  try {while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2_000_000)throw new Error('Page exceeds 2 MB limit');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}
  finally {await reader.cancel().catch(()=>{});}
  return {status:response.status,text};
}
async function recordProduct(env:Env,run:Run,store:Store,url:string,html:string) {
  const item=catalogProduct(html,url,store.retailer);if(!item)return false;
  const now=new Date().toISOString();
  const known=(await env.SPAWN_DB.prepare('SELECT listing_key,canonical_url FROM inventory WHERE canonical_url LIKE ?').bind(store.origin+'/%').all<{listing_key:string;canonical_url:string}>()).results;
  const existing=known.find(row=>catalogUrl(row.canonical_url,store.origin)===url);
  await env.SPAWN_DB.prepare(`INSERT INTO store_catalog_items(store_id,url,title,category,listing_json,evidence_note,first_seen_at,last_seen_at,first_run_id,last_run_id,listing_key)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(store_id,url) DO UPDATE SET title=excluded.title,category=excluded.category,listing_json=excluded.listing_json,
    evidence_note=excluded.evidence_note,last_seen_at=excluded.last_seen_at,last_run_id=excluded.last_run_id,listing_key=COALESCE(store_catalog_items.listing_key,excluded.listing_key)`)
    .bind(store.id,url,item.title,item.category,item.listing?JSON.stringify(item.listing):null,item.note,now,now,run.id,run.id,existing?.listing_key??null).run();
  return true;
}
async function processPage(env:Env,run:Run,store:Store,page:{url:string;kind:string},fetchFn:typeof fetch) {
  let state='DONE',detail='Inspected';
  try {
    const policy=JSON.parse(run.robots_json) as RobotsPolicy|null;
    if(page.kind!=='ROBOTS'&&(!policy||!robotsAllows(policy,page.url))) {state='BLOCKED';detail='Robots policy disallows this path';}
    else {
      const result=await boundedFetch(page.url,fetchFn,target=>page.kind==='ROBOTS'?new URL(target).pathname==='/robots.txt':Boolean(policy&&robotsAllows(policy,target)));
      if(page.kind==='ROBOTS') {
        if(![200,404].includes(result.status))throw new Error(`Robots policy unavailable: HTTP ${result.status}`);
        const rules=parseRobots(result.status===404?'':result.text,store.origin);
        await env.SPAWN_DB.prepare('UPDATE store_catalog_runs SET robots_json=? WHERE id=?').bind(JSON.stringify(rules),run.id).run();
        await enqueue(env,run,store,[...rules.sitemaps,store.origin+'/sitemap.xml'],'SITEMAP');
        await enqueue(env,run,store,[store.origin+'/products.json?limit=250&page=1'],'FEED');
        const known=(await env.SPAWN_DB.prepare('SELECT canonical_url FROM inventory WHERE canonical_url LIKE ? ORDER BY listing_key LIMIT 2000').bind(store.origin+'/%').all<{canonical_url:string}>()).results;
        await enqueue(env,run,store,[store.origin+'/',...known.map(row=>row.canonical_url)],'PAGE');
      } else if(result.status!==200) {state=result.status===403||result.status===429?'BLOCKED':'FAILED';detail=`HTTP ${result.status}`;}
      else if(page.kind==='SITEMAP') {
        const urls=sitemapLinks(result.text,store.origin);
        if(!/<(?:sitemapindex|urlset)\b/i.test(result.text))throw new Error('No supported sitemap');
        const index=/<sitemapindex\b/i.test(result.text),productMaps=urls.filter(url=>/sitemap[_-]products?[_\d.-]/i.test(new URL(url).pathname));
        const selected=index?(productMaps.length?productMaps:urls):urls.filter(candidateCatalogUrl);
        await enqueue(env,run,store,selected,index?'SITEMAP':'PAGE');
        detail=`Found ${urls.length} same-origin URLs; ${selected.length} selected for supported watch scope`;
      } else if(page.kind==='FEED') {
        const feed=JSON.parse(result.text) as {products?:Array<{handle?:string;title?:string}>};
        if(!Array.isArray(feed.products)||feed.products.length>250)throw new Error('Unsupported product feed');
        await enqueue(env,run,store,feed.products.filter(p=>typeof p.handle==='string'&&/^[\w-]+$/.test(p.handle)).map(p=>store.origin+'/products/'+p.handle),'PAGE');
        if(feed.products.length===250){const next=new URL(page.url);next.searchParams.set('page',String(Number(next.searchParams.get('page'))+1));await enqueue(env,run,store,[next.href],'FEED');}
        detail=`Found ${feed.products.length} products; direct pages required for variant, currency and stock evidence`;
      } else {
        let productHtml=result.text;
        if(!catalogProduct(productHtml,page.url,store.retailer)&&/Shopify|shopify/.test(productHtml)&&/^\/products\/[\w-]+$/.test(new URL(page.url).pathname)){
          const productUrl=new URL(page.url);productUrl.pathname+='.js';productUrl.search='';
          if(policy&&robotsAllows(policy,productUrl.href)){
            const data=await boundedFetch(productUrl.href,fetchFn,u=>robotsAllows(policy,u));
            if(data.status===200){const schema=shopifyProductSchema(JSON.parse(data.text),page.url,productHtml);if(schema)productHtml+=schema;}
          }
        }
        const found=await recordProduct(env,run,store,page.url,productHtml);
        detail=found?'Product recorded':'No attributable product JSON-LD; coverage needs review';
        // Bounded storefront/category navigation supplements sitemaps and feeds.
        const links=[...result.text.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map(m=>catalogUrl(m[1].replace(/&amp;/g,'&'),store.origin)).filter((url):url is string=>Boolean(url&&/\/(products|collections|categoria|category|product|producto)\//.test(new URL(url).pathname)));
        await enqueue(env,run,store,links.filter(candidateCatalogUrl),'PAGE');
        if(!found&&/\/(products?|producto)\//.test(new URL(page.url).pathname))state='FAILED';
      }
    }
  } catch(error) {state='FAILED';detail=String((error as Error).message).slice(0,300);}
  await env.SPAWN_DB.prepare('UPDATE store_catalog_pages SET state=?,detail=? WHERE run_id=? AND url=?').bind(state,detail,run.id,page.url).run();
  if(page.kind==='ROBOTS'&&state!=='DONE')await env.SPAWN_DB.batch([
    env.SPAWN_DB.prepare("UPDATE store_catalog_runs SET status='BLOCKED',finished_at=?,note=? WHERE id=?").bind(new Date().toISOString(),detail,run.id),
    env.SPAWN_DB.prepare('UPDATE store_acquisitions SET next_due_at=? WHERE id=?').bind(new Date(Date.now()+store.refresh_hours*3600000).toISOString(),store.id)
  ]);
}
// Insert-only enrollment: existing curated inventory and rejected candidates win.
export async function importStoreCatalog(env:Env,storeId:string) {
  const store=await env.SPAWN_DB.prepare('SELECT * FROM store_acquisitions WHERE id=?').bind(storeId).first<Store>();
  if(!store||store.status!=='APPROVED'||store.marketplace||await storeSuppressed(env,store))return 0;
  const categories=JSON.parse(store.categories_json) as string[];
  const eligible=`store_id=? AND imported_at IS NULL AND listing_json IS NOT NULL AND category IN (SELECT value FROM json_each(?))
    AND NOT EXISTS(SELECT 1 FROM monitoring_candidates c WHERE (c.source_url=store_catalog_items.url OR c.source_listing_key=store_catalog_items.listing_key) AND c.status='REJECTED')`;
  const items=(await env.SPAWN_DB.prepare(`SELECT url,listing_json,first_seen_at,listing_key FROM store_catalog_items WHERE ${eligible} ORDER BY url LIMIT 40`).bind(store.id,store.categories_json).all<{url:string;listing_json:string;first_seen_at:string;listing_key:string|null}>()).results;
  let imported=0;
  for(const item of items) {
    const listing=JSON.parse(item.listing_json) as Listing;if(!categories.includes(listing.watch_category))continue;
    const existing=await env.SPAWN_DB.prepare('SELECT listing_key FROM inventory WHERE canonical_url=?').bind(item.url).first<{listing_key:string}>();
    const key=existing?.listing_key??item.listing_key??await storeDigest(canonicalizeUrl(item.url)),now=new Date().toISOString();
    // The revision/status/vendor guard is repeated in the atomic batch to handle revocation mid-run.
    const gate=`EXISTS(SELECT 1 FROM store_acquisitions s WHERE s.id=? AND s.revision=? AND s.status='APPROVED') AND NOT EXISTS(SELECT 1 FROM vendors WHERE vendor_key=? AND status='SUPPRESSED') AND NOT EXISTS(SELECT 1 FROM monitoring_candidates WHERE (source_listing_key=? OR source_url=?) AND status='REJECTED')`;
    const bindings=[store.id,store.revision,store.vendor_key,key,item.url];
    const results=await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO inventory(listing_key,canonical_url,retailer,title,watch_category,retailer_sku,first_seen_at,last_seen_at,status,availability_state,price_mxn,language,language_evidence,last_change_type,print_series)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate}`)
        .bind(key,item.url,store.retailer,listing.title,listing.watch_category,listing.retailer_sku,item.first_seen_at,now,listing.status,listing.availability_state??listing.status,listing.price_mxn,listing.language,listing.language_evidence,store.baseline_completed_at?'new':'baseline',printSeries(listing.watch_category),...bindings),
      env.SPAWN_DB.prepare(`UPDATE store_catalog_items SET imported_at=?,listing_key=? WHERE store_id=? AND url=? AND ${gate} AND EXISTS(SELECT 1 FROM inventory WHERE listing_key=?)`)
        .bind(now,key,store.id,item.url,...bindings,key),
      targetInsert(env,store,listing,key,now)
    ]);
    imported+=results[1].meta.changes;
    await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare("UPDATE monitoring_candidates SET status='ACCEPTED',disposition='visibility_only',reviewed_by='auto:approved-store',review_reason='Approved store catalog ingestion',reviewed_at=?,published_at=? WHERE status='PENDING' AND candidate_id IN (SELECT candidate_id FROM store_discovery_handoffs WHERE store_id=? AND url=?) AND EXISTS(SELECT 1 FROM store_monitor_targets t JOIN store_acquisitions s ON s.id=t.store_id WHERE t.id=? AND s.status='APPROVED' AND s.revision=?)").bind(now,now,store.id,item.url,key,store.revision),
      env.SPAWN_DB.prepare("INSERT INTO listing_publication_decisions(candidate_id,decision,disposition,reason,decided_by,decided_at) SELECT c.candidate_id,'PUBLISHED','visibility_only','Approved store catalog ingestion','auto:approved-store',? FROM monitoring_candidates c JOIN store_discovery_handoffs h ON h.candidate_id=c.candidate_id WHERE h.store_id=? AND h.url=? AND c.status='ACCEPTED' AND c.reviewed_by='auto:approved-store' AND NOT EXISTS(SELECT 1 FROM listing_publication_decisions d WHERE d.candidate_id=c.candidate_id AND d.decision='PUBLISHED')").bind(now,store.id,item.url)
    ]);
  }
  const backlog=(await env.SPAWN_DB.prepare(`SELECT i.listing_json,i.listing_key FROM store_catalog_items i WHERE i.store_id=? AND i.imported_at IS NOT NULL AND i.listing_json IS NOT NULL AND i.listing_key IS NOT NULL AND NOT EXISTS(SELECT 1 FROM store_monitor_targets t WHERE t.id=i.listing_key) LIMIT 40`).bind(store.id).all<{listing_json:string;listing_key:string}>()).results;
  for(const item of backlog)await targetInsert(env,{...store,baseline_completed_at:null},JSON.parse(item.listing_json),item.listing_key,new Date().toISOString()).run();
  await env.SPAWN_DB.prepare(`UPDATE store_acquisitions SET baseline_completed_at=? WHERE id=? AND status='APPROVED' AND baseline_completed_at IS NULL
    AND EXISTS(SELECT 1 FROM store_catalog_runs WHERE store_id=store_acquisitions.id AND status IN ('COMPLETE','PARTIAL'))
    AND NOT EXISTS(SELECT 1 FROM store_catalog_items WHERE ${eligible}) AND NOT EXISTS(SELECT 1 FROM store_catalog_runs WHERE store_id=? AND status='RUNNING')`)
    .bind(new Date().toISOString(),store.id,store.id,store.categories_json,store.id).run();
  return imported;
}
export async function runCatalogTick(env:Env,storeId?:string,fetchFn:typeof fetch=fetch) {
  if(!storeId&&env.STORE_CATALOG_SYNC_ENABLED!=='true')return;
  if(!storeId)await approveStoresWithAdminInventory(env);
  if(!storeId){const due=await env.SPAWN_DB.prepare(`SELECT s.id FROM store_acquisitions s WHERE s.marketplace=0 AND s.status IN ('PENDING','APPROVED') AND
      ((s.status='PENDING' AND NOT EXISTS(SELECT 1 FROM store_catalog_runs r WHERE r.store_id=s.id)) OR EXISTS(SELECT 1 FROM store_catalog_runs r WHERE r.store_id=s.id AND r.status='RUNNING') OR (s.status='APPROVED' AND (s.baseline_completed_at IS NULL OR s.next_due_at IS NULL OR s.next_due_at<=? OR EXISTS(
        SELECT 1 FROM store_catalog_items i WHERE i.store_id=s.id AND i.imported_at IS NULL AND i.listing_json IS NOT NULL AND i.category IN (SELECT value FROM json_each(s.categories_json)) AND NOT EXISTS(SELECT 1 FROM monitoring_candidates c WHERE (c.source_url=i.url OR c.source_listing_key=i.listing_key) AND c.status='REJECTED'))))) ORDER BY COALESCE(s.last_tick_at,''),s.id LIMIT 3`).bind(new Date().toISOString()).all<{id:string}>();
    await Promise.all(due.results.map(s=>runCatalogTick(env,s.id,fetchFn)));return;}
  const owner=crypto.randomUUID(),now=Date.now(),resource='store-catalog:'+storeId;
  const lock=await env.SPAWN_DB.prepare('INSERT INTO ops_review_locks(resource,owner,expires_at) VALUES(?,?,?) ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE ops_review_locks.expires_at<?').bind(resource,owner,now+180000,now).run();
  if(!lock.meta.changes)return;
  try {
    const store=await env.SPAWN_DB.prepare('SELECT * FROM store_acquisitions WHERE id=?').bind(storeId).first<Store>();
    if(!store)return;
    await env.SPAWN_DB.prepare('UPDATE store_acquisitions SET last_tick_at=? WHERE id=?').bind(new Date().toISOString(),store.id).run();
    if(['REJECTED','PAUSED'].includes(store.status)||await storeSuppressed(env,store))return;
    if(store.status==='APPROVED'){
      const discoveries=(await env.SPAWN_DB.prepare("SELECT candidate_id,source_url FROM monitoring_candidates WHERE status='PENDING' AND source_url LIKE ? AND NOT EXISTS(SELECT 1 FROM store_discovery_handoffs h WHERE h.candidate_id=monitoring_candidates.candidate_id) ORDER BY discovered_at LIMIT 40").bind(store.origin+'/%').all<{candidate_id:string;source_url:string}>()).results;
      for(const item of discoveries)await queueApprovedStoreDiscovery(env,item.candidate_id,item.source_url);
    }
    const running=await env.SPAWN_DB.prepare("SELECT id FROM store_catalog_runs WHERE store_id=? AND status='RUNNING'").bind(store.id).first<{id:string}>();
    if(!running&&store.status==='APPROVED'&&store.next_due_at&&store.next_due_at>new Date().toISOString()) {await importStoreCatalog(env,store.id);return;}
    const runId=running?.id??await startCatalogRun(env,store.id,'scheduled-catalog');
    for(let i=0;i<PAGES_PER_TICK&&Date.now()-now<55000;i++) {
      const active=await env.SPAWN_DB.prepare('SELECT status FROM store_acquisitions WHERE id=?').bind(store.id).first<{status:string}>();
      if(!active||['REJECTED','PAUSED'].includes(active.status)||await storeSuppressed(env,store))return;
      const run=await env.SPAWN_DB.prepare("SELECT * FROM store_catalog_runs WHERE id=? AND status='RUNNING'").bind(runId).first<Run>();if(!run)break;
      const page=await env.SPAWN_DB.prepare("SELECT url,kind FROM store_catalog_pages WHERE run_id=? AND state='PENDING' ORDER BY CASE WHEN kind='ROBOTS' THEN 0 WHEN EXISTS(SELECT 1 FROM store_discovery_handoffs h WHERE h.url=store_catalog_pages.url) THEN 0.5 WHEN kind='PAGE' AND (url LIKE '%/products/%' OR url LIKE '%/product/%' OR url LIKE '%/producto/%') THEN 1 WHEN kind='FEED' THEN 2 WHEN kind='SITEMAP' THEN 3 ELSE 4 END,url LIMIT 1").bind(run.id).first<{url:string;kind:string}>();
      if(!page) {
        const failure=await env.SPAWN_DB.prepare("SELECT COUNT(*) n FROM store_catalog_pages WHERE run_id=? AND state IN ('FAILED','BLOCKED')").bind(run.id).first<{n:number}>();
        const partial=Boolean(failure?.n||run.note);
        await env.SPAWN_DB.batch([
          env.SPAWN_DB.prepare('UPDATE store_catalog_runs SET status=?,finished_at=?,note=? WHERE id=?').bind(partial?'PARTIAL':'COMPLETE',new Date().toISOString(),run.note||'Accessible frontier exhausted; this does not establish whole-store completeness',run.id),
          env.SPAWN_DB.prepare('UPDATE store_acquisitions SET last_completed_at=?,next_due_at=? WHERE id=?').bind(new Date().toISOString(),new Date(Date.now()+store.refresh_hours*3600000).toISOString(),store.id)
        ]);break;
      }
      await processPage(env,run,store,page,fetchFn);
    }
    await importStoreCatalog(env,store.id);
  } finally {await env.SPAWN_DB.prepare('DELETE FROM ops_review_locks WHERE resource=? AND owner=?').bind(resource,owner).run();}
}
export async function decideStore(env:Env,id:string,revision:number,action:string,categories:string[],hours:number,actor:string) {
  if(!['approve','reject','pause'].includes(action)||!Number.isInteger(revision)||!actor)throw new Error('Invalid store decision');
  if(action==='approve'&&(!categories.length||categories.some(c=>!STORE_CATEGORIES.includes(c as typeof STORE_CATEGORIES[number]))||![6,12,24].includes(hours)))throw new Error('Choose supported categories and cadence');
  const store=await env.SPAWN_DB.prepare('SELECT * FROM store_acquisitions WHERE id=?').bind(id).first<Store>();
  if(!store||store.revision!==revision)throw new Error('Store changed; reload before deciding');
  if(action==='approve'&&(store.marketplace||await storeSuppressed(env,store)))throw new Error('Suppressed stores and marketplaces cannot receive whole-store approval');
  const status=action==='approve'?'APPROVED':action==='reject'?'REJECTED':'PAUSED',decisionId=crypto.randomUUID(),at=new Date().toISOString();
  const results=await env.SPAWN_DB.batch([
    env.SPAWN_DB.prepare(`UPDATE store_acquisitions SET status=?,revision=revision+1,categories_json=?,refresh_hours=?,approved_by=CASE WHEN ?='APPROVED' THEN ? ELSE approved_by END,approved_at=CASE WHEN ?='APPROVED' THEN ? ELSE approved_at END WHERE id=? AND revision=?`)
      .bind(status,action==='approve'?JSON.stringify([...new Set(categories)]):store.categories_json,action==='approve'?hours:store.refresh_hours,status,actor,status,at,id,revision),
    env.SPAWN_DB.prepare(`INSERT INTO store_acquisition_decisions(id,store_id,action,actor,decided_at,revision,details_json) SELECT ?,?,?,?,?,?,? WHERE changes()=1`)
      .bind(decisionId,id,action,actor,at,revision+1,JSON.stringify({categories,hours,policy:STORE_POLICY})),
    env.SPAWN_DB.prepare('UPDATE store_acquisitions SET policy_json=? WHERE id=? AND EXISTS(SELECT 1 FROM store_acquisition_decisions WHERE id=?)').bind(JSON.stringify(STORE_POLICY),id,decisionId),
    env.SPAWN_DB.prepare("UPDATE store_catalog_runs SET status='PARTIAL',finished_at=?,note='Stopped by store decision' WHERE store_id=? AND status='RUNNING' AND ?<>'approve' AND EXISTS(SELECT 1 FROM store_acquisition_decisions WHERE id=?)").bind(at,id,action,decisionId)
  ]);
  if(!results[0].meta.changes)throw new Error('Store changed; reload before deciding');
}
