import {describe,it,expect} from 'vitest';import {DatabaseSync} from 'node:sqlite';
import {ITEMS} from '../src/amazon-browser-targets';import {resolveScoutCatalog,scoutCatalog,type PublishedTarget} from '../src/scout-target-catalog';
import {validateAmazonBrowserObservation} from '../src/amazon-browser';import {diagnoseScout} from '../src/scout-diagnostics';
const row=(asin:string,name:string,category='delta_reign',language='english'):PublishedTarget=>({asin,product_name:name,product_url:'https://www.amazon.com.mx/dp/'+asin,watch_category:category,language,approved_at:'2026-08-27T23:00:00Z'});
const base=()=>ITEMS.map(i=>row(i.asin,i.name,i.category));
const extras=()=>[row('B0HG3JBNBN','Delta Reign Three Booster Blister'),row('B0HG47DGH4','Delta Reign Build & Battle Box'),row('B0GXC89N66','The Hobbit Collector Booster Box','mtg_hobbit_collector_box'),row('B0H27L3TKW','Pitch Black','pokemon_tcg','unknown')];
describe('bounded published Scout catalog',()=>{
 it('selects nineteen currently eligible products and holds unknown language',()=>{
  const c=resolveScoutCatalog([...base(),...extras()]);expect(c.targets).toHaveLength(19);expect(c.excluded).toEqual([{asin:'B0H27L3TKW',reason:'language_review_required'}]);
  for(const i of ITEMS)expect(c.targets.find(t=>t.asin===i.asin)?.titlePattern).toBe(i.titlePattern);
  expect(c.targets.find(t=>t.asin==='B0GXC89N66')?.routingKey).toBe('magic-hobbit');
 });
 it('retains the original sixteen ahead of new candidates and caps at twenty',()=>{
  const many=Array.from({length:12},(_,i)=>row('B0NEW'+String(i).padStart(5,'0'),'Delta Reign Booster Box '+i));
  const c=resolveScoutCatalog([...many,...base(),...extras()]);expect(c.targets).toHaveLength(20);expect(ITEMS.every(i=>c.targets.some(t=>t.asin===i.asin))).toBe(true);expect(c.excluded.some(t=>t.reason==='capacity_review_required')).toBe(true);
 });
 it('derives bounded identity patterns without accepting arbitrary regex or other scope',()=>{
  const c=resolveScoutCatalog([row('B0NEW00001','Delta Reign Booster Box'),row('B0NEW00002','Other product','pokemon_tcg'),{...row('B0NEW00003','Delta Reign Booster Box'),product_url:'https://evil.test/dp/B0NEW00003'}]);
  expect(c.targets).toHaveLength(1);expect(new RegExp(c.targets[0].titlePattern,'i').test('Pokemon Delta Reign Booster Box')).toBe(true);expect(new RegExp(c.targets[0].titlePattern,'i').test('Other Booster Box')).toBe(false);
 });
 it('validates additional observations against their own exact identity',()=>{
  const c=resolveScoutCatalog(extras()),target=c.targets.find(t=>t.asin==='B0HG47DGH4')!;
  const record={schemaVersion:1,source:'amazon_edge',id:'00000000-0000-0000-0000-000000000001',asin:target.asin,url:target.url,title:'Pokemon Delta Reign Build & Battle Box',observedAt:new Date().toISOString(),state:'sold_out',reason:'EXPLICIT_PRODUCT_UNAVAILABLE',buyingOptionsShown:false};
  expect(validateAmazonBrowserObservation(record,Date.now(),c.targets)).not.toBeNull();expect(validateAmazonBrowserObservation({...record,title:'Other Booster Bundle'},Date.now(),c.targets)).toBeNull();expect(validateAmazonBrowserObservation(record)).toBeNull();
 });
 it('keeps legacy operation when disabled and filters removed/pending database rows when enabled',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE amazon_watchlist(asin TEXT,product_name TEXT,product_url TEXT,watch_category TEXT,language TEXT,approved_at TEXT,lifecycle_status TEXT);CREATE TABLE inventory(listing_key TEXT,canonical_url TEXT);CREATE TABLE inventory_admin_reviews(listing_key TEXT,removed_at TEXT)');
  for(const r of [...base(),...extras()])db.prepare('INSERT INTO amazon_watchlist VALUES(?,?,?,?,?,?,?)').run(r.asin,r.product_name,r.product_url,r.watch_category,r.language,r.approved_at,'PUBLISHED');
  const env:any={SCOUT_DYNAMIC_TARGETS_ENABLED:'true',SPAWN_DB:{prepare(sql:string){return {async all(){return {results:db.prepare(sql).all()};}};}}};
  try{
   expect((await scoutCatalog(env)).targets).toHaveLength(19);const version=(await scoutCatalog(env)).version;expect(version).toMatch(/^[a-f0-9]{64}$/);
   db.prepare('INSERT INTO inventory VALUES(?,?)').run('removed','https://www.amazon.com.mx/dp/B0HG47DGH4');db.prepare('INSERT INTO inventory_admin_reviews VALUES(?,?)').run('removed','2026-11-02');
   expect((await scoutCatalog(env)).targets).toHaveLength(18);expect((await scoutCatalog(env)).version).not.toBe(version);
   env.SCOUT_DYNAMIC_TARGETS_ENABLED='false';expect((await scoutCatalog(env)).targets).toHaveLength(16);expect((await scoutCatalog(env)).version).toBeNull();
  }finally{db.close();}
 });
 it('reports catalog drift instead of calling the old sixteen fully healthy',()=>{
  const at=new Date().toISOString();const host:any={observedAt:at,receivedAt:at,desktop:'active',amazonService:'active',snapshotAt:at,localFresh:16,acceptedFresh:16};
  expect(diagnoseScout(host,null,null,null,Date.now(),{total:19,version:'a'.repeat(64)}).code).toBe('catalog_sync_pending');
  expect(diagnoseScout({...host,targetCount:19,catalogVersion:'a'.repeat(64),localFresh:19,acceptedFresh:19},null,null,null,Date.now(),{total:19,version:'a'.repeat(64)}).code).toBe('healthy');
 });
});
