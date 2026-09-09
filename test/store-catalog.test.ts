import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import type {Env} from '../src/types';
import {auditKnownStores,decideStore,importStoreCatalog,runCatalogTick,startCatalogRun,type Store} from '../src/store-catalog';
import {catalogOrigin,catalogProduct,catalogUrl,candidateCatalogUrl,parseRobots,robotsAllows,sitemapLinks} from '../src/store-catalog-parser';
import {storeCatalogOperations} from '../src/store-catalog-operations';
let db:DatabaseSync,env:Env;
function adapter(){
  const prepare=(sql:string)=>{let values:unknown[]=[];return {
    bind(...args:unknown[]){values=args;return this;},async first(){return db.prepare(sql).get(...values as never[])??null;},
    async all(){return {results:db.prepare(sql).all(...values as never[]),success:true};},
    execute(){const result=db.prepare(sql).run(...values as never[]);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},async run(){return this.execute();}
  };};
  return {prepare,async batch(statements:Array<{execute:()=>unknown}>){db.exec('BEGIN');try{const results=statements.map(s=>s.execute());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
beforeEach(()=>{db=new DatabaseSync(':memory:');for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));env={SPAWN_DB:adapter(),STORE_CATALOG_SYNC_ENABLED:'false'} as unknown as Env;vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('Unexpected network');}));});
afterEach(()=>{db.close();vi.unstubAllGlobals();});
const origin='https://cards.example',known=origin+'/products/known',fresh=origin+'/products/delta-reign-new';
function inventory(url=known,name='Cards',key='known'){db.prepare("INSERT INTO inventory(listing_key,canonical_url,retailer,title,watch_category,first_seen_at,last_seen_at,status,language,price_mxn) VALUES(?,?,?,'Curated name','delta_reign','2026-09-01','2026-09-01','sold_out','english',1200)").run(key,url,name);}
function store(){return db.prepare('SELECT * FROM store_acquisitions WHERE origin=?').get(origin) as unknown as Store;}
function page(url=fresh,name='Delta Reign English Booster Bundle',availability='InStock',offers?:unknown){return '<script type="application/ld+json">'+JSON.stringify({'@type':'Product',url,name,sku:'sku-'+url.split('/').at(-1),offers:offers??{'@type':'Offer',url,availability:'https://schema.org/'+availability,price:1000,priceCurrency:'MXN'}})+'</script>';}
const crawler=()=>vi.fn(async(input:RequestInfo|URL)=>{
  const url=String(input);
  if(url===origin+'/robots.txt')return new Response('User-agent: *\nDisallow: /private');
  if(url===origin+'/sitemap.xml')return new Response('<urlset>'+[known,fresh].map(u=>'<url><loc>'+u+'</loc></url>').join('')+'</urlset>');
  if(url.includes('/products.json'))return new Response('',{status:404});
  if(url===origin+'/')return new Response('<h1>Cards</h1>');
  return new Response(page(url));
});
async function audit(){inventory();await auditKnownStores(env);await startCatalogRun(env,store().id,'admin');await runCatalogTick(env,store().id,crawler());}
async function approve(){const s=store();await decideStore(env,s.id,s.revision,'approve',['delta_reign'],6,'admin');}
it('groups known stores by exact origin without copying product approvals or reviving rejected stores',async()=>{
  inventory();inventory(origin+'/products/second','Cards alias','second');inventory('https://www.amazon.com.mx/dp/B012345678','Amazon','amazon');
  const report=await auditKnownStores(env);expect(report.added).toBe(2);expect(store().status).toBe('PENDING');
  expect(db.prepare('SELECT marketplace FROM store_acquisitions WHERE origin LIKE ?').get('%amazon%')?.marketplace).toBe(1);
  await decideStore(env,store().id,store().revision,'reject',[],6,'admin');await auditKnownStores(env);expect(store().status).toBe('REJECTED');
});
it('audits before approval, imports quietly and preserves existing inventory and global baselines',async()=>{
  await audit();expect(db.prepare('SELECT COUNT(*) n FROM store_catalog_items').get()?.n).toBe(2);
  expect(db.prepare('SELECT COUNT(*) n FROM inventory').get()?.n).toBe(1);
  expect(await importStoreCatalog(env,store().id)).toBe(0);
  await approve();expect(await importStoreCatalog(env,store().id)).toBe(2);
  expect(db.prepare('SELECT title,price_mxn FROM inventory WHERE listing_key=?').get('known')).toMatchObject({title:'Curated name',price_mxn:1200});
  expect(db.prepare('SELECT COUNT(*) n FROM inventory').get()?.n).toBe(2);
  expect(db.prepare('SELECT last_change_type FROM inventory WHERE canonical_url=?').get(fresh)?.last_change_type).toBe('baseline');
  expect(db.prepare('SELECT COUNT(*) n FROM customer_inventory_events').get()?.n).toBe(0);
  expect(db.prepare("SELECT COUNT(*) n FROM worker_state WHERE key='inventory_initialized'").get()?.n).toBe(0);
  expect(db.prepare('SELECT COUNT(*) n FROM discovery_approval_notifications').get()?.n).toBe(0);
  expect(store().baseline_completed_at).toBeTruthy();expect(await importStoreCatalog(env,store().id)).toBe(0);
});
it('requires a finished audit and an unchanged review revision',async()=>{
  inventory();await auditKnownStores(env);const s=store();
  await expect(decideStore(env,s.id,s.revision,'approve',['delta_reign'],6,'admin')).rejects.toThrow('Finish');
  await startCatalogRun(env,s.id,'admin');await expect(decideStore(env,s.id,s.revision,'approve',['delta_reign'],6,'admin')).rejects.toThrow('changed');
  await runCatalogTick(env,s.id,crawler());await approve();
  await expect(decideStore(env,s.id,s.revision,'reject',[],6,'admin')).rejects.toThrow('changed');
  expect(db.prepare('SELECT COUNT(*) n FROM store_acquisition_decisions').get()?.n).toBe(1);
});
it('does not enroll a marketplace or fetch a suppressed retailer alias',async()=>{
  inventory();inventory(origin+'/products/alias','Blocked name','alias');await auditKnownStores(env);
  db.exec("INSERT INTO vendors(vendor_key,vendor_name,status,updated_at,reason) VALUES('blocked-name','Blocked name','SUPPRESSED','now','test')");
  await expect(startCatalogRun(env,store().id,'admin')).rejects.toThrow('suppressed');
  inventory('https://www.amazon.com.mx/dp/B012345678','Amazon','amazon');await auditKnownStores(env);
  const marketplace=db.prepare('SELECT * FROM store_acquisitions WHERE marketplace=1').get()!;
  await expect(startCatalogRun(env,String(marketplace.id),'admin')).rejects.toThrow('marketplace');
});
it('preserves rejected candidates and does not let an unsupported category starve imports',async()=>{
  await audit();await approve();
  db.prepare("INSERT INTO monitoring_candidates(candidate_id,source,source_url,source_listing_key,vendor,vendor_key,product_name,product_family,print_series,language,discovered_at,status) VALUES('rejected','spawn',?,'rejected','Cards','cards','Delta','pokemon_tcg','Delta Reign','english','now','REJECTED')").run(fresh);
  await importStoreCatalog(env,store().id);expect(db.prepare('SELECT COUNT(*) n FROM inventory').get()?.n).toBe(1);
  expect(store().baseline_completed_at).toBeTruthy();
});
it('stops a paused run and requires new approval before resuming imports',async()=>{
  await audit();await approve();await decideStore(env,store().id,store().revision,'pause',[],6,'admin');
  const f=crawler();await runCatalogTick(env,store().id,f);expect(f).not.toHaveBeenCalled();expect(await importStoreCatalog(env,store().id)).toBe(0);
});
it('keeps scheduled work inert until activated, then resumes persisted work',async()=>{
  inventory();await auditKnownStores(env);await startCatalogRun(env,store().id,'admin');const f=crawler();
  await runCatalogTick(env,undefined,f);expect(f).not.toHaveBeenCalled();env.STORE_CATALOG_SYNC_ENABLED='true';
  await runCatalogTick(env,undefined,f);expect(f).toHaveBeenCalled();expect(db.prepare('SELECT status FROM store_catalog_runs').get()?.status).toBe('PARTIAL');
  await approve();await importStoreCatalog(env,store().id);f.mockClear();await runCatalogTick(env,undefined,f);expect(f).not.toHaveBeenCalled();
});
it('automatically audits a new pending store without approving or importing it, then drains approved imports',async()=>{
  inventory();await auditKnownStores(env);env.STORE_CATALOG_SYNC_ENABLED='true';const f=crawler();
  await runCatalogTick(env,undefined,f);
  expect(f).toHaveBeenCalled();expect(store().status).toBe('PENDING');
  expect(db.prepare('SELECT COUNT(*) n FROM inventory').get()?.n).toBe(1);
  const count=f.mock.calls.length;await runCatalogTick(env,undefined,f);
  expect(f.mock.calls.length).toBe(count);
  await approve();await runCatalogTick(env,undefined,f);
  expect(store().baseline_completed_at).toBeTruthy();
  expect(db.prepare('SELECT COUNT(*) n FROM inventory').get()?.n).toBe(2);
});
it('shows automatic progress instead of manual batch controls',async()=>{
  inventory();await auditKnownStores(env);env.STORE_CATALOG_SYNC_ENABLED='true';
  const response=await storeCatalogOperations(new Request('https://spawn.example/ops/stores?id='+store().id),env,{email:'admin',subject:'admin',role:'admin'});
  const html=await response.text();expect(html).toContain('Queued for automatic audit');
  expect(html).not.toContain('Process next catalog batch');expect(html).not.toContain('Import next approved batch');
});
it('honors robots, rejects redirects, and records blocked coverage without inventory mutation',async()=>{
  inventory();await auditKnownStores(env);const f=vi.fn(async()=>new Response('User-agent: *\nDisallow: /'));
  await startCatalogRun(env,store().id,'admin');await runCatalogTick(env,store().id,f);expect(f).toHaveBeenCalledTimes(1);
  expect(db.prepare('SELECT COUNT(*) n FROM store_catalog_items').get()?.n).toBe(0);
  await startCatalogRun(env,store().id,'admin');await runCatalogTick(env,store().id,async()=>new Response('',{status:302,headers:{Location:'http://127.0.0.1/'}}));
  expect(db.prepare("SELECT COUNT(*) n FROM store_catalog_runs WHERE status='BLOCKED'").get()?.n).toBe(1);
});
it('does not reset imported items or revive missing items when a later scan fails',async()=>{
  await audit();await approve();await importStoreCatalog(env,store().id);const before=db.prepare('SELECT * FROM inventory ORDER BY listing_key').all();
  await startCatalogRun(env,store().id,'admin');await runCatalogTick(env,store().id,async()=>new Response('',{status:503}));
  expect(db.prepare('SELECT * FROM inventory ORDER BY listing_key').all()).toEqual(before);
});
it('bounds each tick and resumes sitemap pagination without duplicate products',async()=>{
  inventory();await auditKnownStores(env);const urls=Array.from({length:15},(_,i)=>origin+'/products/delta-reign-'+i);
  const f=vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('sitemap.xml')?new Response('<urlset>'+urls.map(u=>'<loc>'+u+'</loc>').join('')+'</urlset>'):crawler()(input));
  await startCatalogRun(env,store().id,'admin');await runCatalogTick(env,store().id,f);expect(f.mock.calls.length).toBeLessThanOrEqual(8);
  expect(db.prepare('SELECT status FROM store_catalog_runs').get()?.status).toBe('RUNNING');
  await runCatalogTick(env,store().id,f);await runCatalogTick(env,store().id,f);
  expect(db.prepare('SELECT COUNT(*) n FROM store_catalog_items').get()?.n).toBe(16);
});
it('protects controls and escapes retailer/product evidence',async()=>{
  await audit();db.prepare('UPDATE store_acquisitions SET retailer=?').run('<script>evil</script>');
  const operator={email:'admin',subject:'admin',role:'admin' as const};
  const pageResponse=await storeCatalogOperations(new Request('https://spawn.example/ops/stores?id='+store().id),env,operator);
  const html=await pageResponse.text();expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');expect(html).toContain('Approve store inventory');
  const request=new Request('https://spawn.example/ops/stores',{method:'POST',body:new URLSearchParams({action:'audit_inventory'})});
  expect((await storeCatalogOperations(request,env,{...operator,role:'viewer'})).status).toBe(403);
});
it('validates URLs, sitemap entities, and robots rules',()=>{
  for(const url of ['http://cards.example','https://127.0.0.1','https://[::1]','https://a.internal','https://user:pass@cards.example','https://cards.example:444'])expect(catalogOrigin(url)).toBeNull();
  expect(catalogUrl('https://evil.example/',origin)).toBeNull();
  expect(catalogUrl('/collections/all/products/delta-reign',origin)).toBe(origin+'/products/delta-reign');
  expect(candidateCatalogUrl(origin+'/collections/figures')).toBe(false);
  expect(candidateCatalogUrl(origin+'/products/unrelated-figure')).toBe(false);
  expect(candidateCatalogUrl(origin+'/products/delta-reign')).toBe(true);
  expect(sitemapLinks('<urlset><loc>'+origin+'/products/a?x=1&amp;y=2</loc><loc>https://evil.example/</loc></urlset>',origin)).toEqual([origin+'/products/a?x=1&y=2']);
  expect(()=>sitemapLinks('<!DOCTYPE x>',origin)).toThrow();
  const rules=parseRobots('User-agent: *\nDisallow: /private*\nUser-agent: Other\nDisallow: /',origin);
  expect(robotsAllows(rules,origin+'/private/a')).toBe(false);expect(robotsAllows(rules,fresh)).toBe(true);
});
it('links an existing Shopify collection URL to its canonical product without duplicating inventory',async()=>{
  const alias=origin+'/collections/all/products/delta-reign-known';inventory(alias);await auditKnownStores(env);
  await startCatalogRun(env,store().id,'admin');await runCatalogTick(env,store().id,crawler());await approve();await importStoreCatalog(env,store().id);
  expect(db.prepare('SELECT listing_key FROM store_catalog_items WHERE url=?').get(origin+'/products/delta-reign-known')?.listing_key).toBe('known');
  expect(db.prepare('SELECT canonical_url,title FROM inventory WHERE listing_key=?').get('known')).toMatchObject({canonical_url:alias,title:'Curated name'});
});
it('keeps the initial baseline open across import batches and labels later additions as new',async()=>{
  await audit();await approve();
  const sample=db.prepare('SELECT * FROM store_catalog_items WHERE url=?').get(fresh)!;
  for(let i=0;i<45;i++) {
    const url=origin+'/products/delta-reign-batch-'+i,listing=JSON.parse(String(sample.listing_json));listing.url=url;
    db.prepare('INSERT INTO store_catalog_items(store_id,url,title,category,listing_json,evidence_note,first_seen_at,last_seen_at,first_run_id,last_run_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(store().id,url,listing.title,'delta_reign',JSON.stringify(listing),'fixture','now','now',sample.first_run_id,sample.last_run_id);
  }
  await importStoreCatalog(env,store().id);expect(store().baseline_completed_at).toBeNull();
  await importStoreCatalog(env,store().id);expect(store().baseline_completed_at).toBeTruthy();
  expect(db.prepare("SELECT COUNT(*) n FROM inventory WHERE last_change_type='new'").get()?.n).toBe(0);
  const later=JSON.parse(String(sample.listing_json));later.url=origin+'/products/delta-reign-later';
  db.prepare('INSERT INTO store_catalog_items(store_id,url,title,category,listing_json,evidence_note,first_seen_at,last_seen_at,first_run_id,last_run_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(store().id,later.url,later.title,'delta_reign',JSON.stringify(later),'fixture','later','later',sample.first_run_id,sample.last_run_id);
  await importStoreCatalog(env,store().id);expect(db.prepare('SELECT last_change_type FROM inventory WHERE canonical_url=?').get(later.url)?.last_change_type).toBe('new');
});
it('retains sold-out/preorder products and quarantines ambiguous variants or unknown scope',()=>{
  expect(catalogProduct(page(fresh,undefined,'OutOfStock'),fresh,'Cards')?.listing?.status).toBe('sold_out');
  expect(catalogProduct(page(fresh,undefined,'PreOrder'),fresh,'Cards')?.listing?.availability_state).toBe('preorder_placeholder');
  expect(catalogProduct(page(fresh,'Unrelated product'),fresh,'Cards')?.listing).toBeNull();
  expect(catalogProduct(page(fresh,undefined,undefined,[{availability:'https://schema.org/InStock',price:'10',priceCurrency:'MXN'},{availability:'https://schema.org/OutOfStock',price:'20',priceCurrency:'MXN'}]),fresh,'Cards')?.listing).toBeNull();
  expect(catalogProduct('<title>Robot check</title>'+page(),fresh,'Cards')?.listing).toBeNull();
});
