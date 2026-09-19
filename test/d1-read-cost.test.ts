import {beforeEach,afterEach,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {enqueue,nextCatalogPage,type Store} from '../src/store-catalog';
import type {Env} from '../src/types';
let db:DatabaseSync,env:Env,queries:string[];
const origin='https://cards.example';
const run={id:'run',store_id:'store',status:'RUNNING',robots_json:'null',started_at:'now',note:''};
const store={id:'store',origin} as Store;
beforeEach(()=>{
 db=new DatabaseSync(':memory:');queries=[];
 for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
 db.exec(`INSERT INTO store_acquisitions(id,origin,retailer,vendor_key,created_at) VALUES('store','${origin}','Cards','cards','now');
 INSERT INTO store_catalog_runs(id,store_id,status,started_at,started_by) VALUES('run','store','RUNNING','now','test');`);
 env={SPAWN_DB:{prepare(sql:string){
   let args:any[]=[];
   return {
     bind(...values:any[]){args=values;return this;},
     async first(){queries.push(sql);return db.prepare(sql).get(...args)??null;},
     async run(){queries.push(sql);return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}
   };
 }}} as unknown as Env;
});
afterEach(()=>db.close());
it('deduplicates repeated frontiers with bounded statements and admits fresh URLs after duplicates',async()=>{
 const urls=Array.from({length:1200},(_,i)=>origin+'/products/'+i);
 await enqueue(env,run,store,urls,'PAGE');
 queries=[];
 await enqueue(env,run,store,[...urls,...urls,origin+'/products/new'],'PAGE');
 expect(db.prepare('SELECT COUNT(*) n FROM store_catalog_pages').get()?.n).toBe(1201);
 expect(queries.length).toBeLessThan(10);
});
it('enforces the 25000 page limit across competing batches and full-queue retries',async()=>{
 db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<24998)
 INSERT INTO store_catalog_pages(run_id,url,kind) SELECT 'run','${origin}/products/'||x,'PAGE' FROM n;`);
 await Promise.all([enqueue(env,run,store,[origin+'/a',origin+'/b'],'PAGE'),enqueue(env,run,store,[origin+'/c',origin+'/d'],'PAGE')]);
 expect(db.prepare('SELECT COUNT(*) n FROM store_catalog_pages').get()?.n).toBe(25000);
 queries=[];await enqueue(env,run,store,Array.from({length:1500},(_,i)=>origin+'/extra/'+i),'PAGE');
 expect(db.prepare('SELECT COUNT(*) n FROM store_catalog_pages').get()?.n).toBe(25000);
 expect(queries.filter(sql=>sql.includes('INSERT OR IGNORE')).length).toBe(1);
 expect(db.prepare('SELECT note FROM store_catalog_runs').get()?.note).toContain('limit reached');
});
it('preserves robots, discovery, product, feed, sitemap and other page priority without queue sorts',async()=>{
 const pages=[['/z','PAGE'],['/sitemap.xml','SITEMAP'],['/feed','FEED'],['/products/a','PAGE'],['/discovery','PAGE'],['/robots.txt','ROBOTS']];
 for(const [path,kind] of pages)db.prepare("INSERT INTO store_catalog_pages VALUES('run',?,?,'PENDING',NULL)").run(origin+path,kind);
 db.exec("INSERT INTO monitoring_candidates(candidate_id,source,source_listing_key,source_url,vendor,vendor_key,product_name,product_family,print_series,language,discovered_at) VALUES('candidate','test','listing','https://cards.example/discovery','Cards','cards','Test','pokemon_tcg','test','english','now')");
 db.prepare("INSERT INTO store_discovery_handoffs VALUES('candidate','store',?,'now')").run(origin+'/discovery');
 for(const [path] of [...pages].reverse()){
   expect((await nextCatalogPage(env,'run','store'))?.url).toBe(origin+path);
   db.prepare("UPDATE store_catalog_pages SET state='DONE' WHERE url=?").run(origin+path);
 }
 expect(await nextCatalogPage(env,'run','store')).toBeNull();
 for(const sql of new Set(queries)){
   const plan=db.prepare('EXPLAIN QUERY PLAN '+sql).all(...(sql.includes('CROSS JOIN')?['run','store']:['run']));
   expect(plan.map(p=>p.detail).join('\n')).not.toContain('USE TEMP B-TREE');
 }
});
it('indexes the production revalidation latest-candidate lookup instead of scanning candidates per inventory row',()=>{
 const sql="SELECT candidate_id FROM monitoring_candidates WHERE source_listing_key=? AND status='ACCEPTED' ORDER BY discovered_at DESC LIMIT 1";
 const plan=db.prepare('EXPLAIN QUERY PLAN '+sql).all('listing').map(p=>p.detail).join('\n');
 expect(plan).toContain('monitoring_candidates_listing_status_latest');
 expect(plan).not.toContain('USE TEMP B-TREE');
 expect(plan).not.toContain('SCAN monitoring_candidates');
});
