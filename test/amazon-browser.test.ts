import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {validateAmazonBrowserObservation,handleAmazonBrowser} from '../src/amazon-browser';
const observation=()=>({schemaVersion:1,source:'amazon_edge',id:'00000000-0000-0000-0000-000000000001',asin:'B0H77VYKSM',url:'https://www.amazon.com.mx/dp/B0H77VYKSM',title:'Pokémon TCG 30th Celebration Ultra-Premium Collection Day',observedAt:new Date().toISOString(),state:'buying_options_shown',reason:'BUYING_OPTIONS_CONTROL_VISIBLE',buyingOptionsShown:true});
describe('Amazon browser signal intake',()=>{
 it('projects a signal without trusting client stock claims or private fields',()=>{
  const r=validateAmazonBrowserObservation({...observation(),priceMxn:3649,seller:'Amazon',availabilityState:'available',accountEmail:'private'});
  expect(r?.availabilityState).toBe('unknown');expect(r?.label).toBe('Buying options shown — click to see offers');expect(r).not.toHaveProperty('priceMxn');expect(r).not.toHaveProperty('accountEmail');
 });
 it('rejects wrong targets, stale evidence and inconsistent signal flags',()=>{
  for(const patch of [{asin:'B000000000'},{url:'https://evil.test/dp/B0H77VYKSM'},{url:'https://www.amazon.com.mx/dp/B0H77XNKKK'},{observedAt:'2020-01-01'},{observedAt:new Date(Date.now()+120000).toISOString()},{title:'unrelated'},{buyingOptionsShown:false},{buyingOptionsShown:null},{state:'available'},{reason:'EXPLICIT_PRODUCT_UNAVAILABLE'},{source:'catch'},{schemaVersion:2}])expect(validateAmazonBrowserObservation({...observation(),...patch})).toBeNull();
 });
 it('retains bounded missing-tab diagnostics as unknown',()=>{
  expect(validateAmazonBrowserObservation({...observation(),state:'unknown',title:'',reason:'TAB_MISSING',buyingOptionsShown:null})?.availabilityState).toBe('unknown');
 });
 it('authenticates before database access and rejects shared credentials',async()=>{
  for(const env of [{},{AMAZON_COLLECTOR_TOKEN:'amazon'},{AMAZON_COLLECTOR_TOKEN:'catch',CATCH_INGEST_SECRET:'catch'},{AMAZON_COLLECTOR_TOKEN:'catch',WALMART_COLLECTOR_TOKEN:'catch'}]){
   const response=await handleAmazonBrowser(new Request('https://spawn.test/internal/amazon-browser/status',{headers:{authorization:'Bearer catch'}}),env as any);expect(response?.status).toBe(401);
  }
 });
 it('stores idempotent indexed receipts, preserves ordering and never writes inventory or alerts',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync('migrations/0046_amazon_browser_observations.sql','utf8'));
  db.exec("CREATE TABLE amazon_watchlist(asin TEXT PRIMARY KEY,lifecycle_status TEXT,watch_category TEXT); INSERT INTO amazon_watchlist VALUES('B0H77VYKSM','PUBLISHED','30th_celebration');");
  // No inventory or outbox table exists: any accidental write to either fails.
  const prepare=(sql:string)=>{let args:any[]=[];return {bind(...v:any[]){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async run(){return db.prepare(sql).run(...args);}};};
  const env={AMAZON_COLLECTOR_TOKEN:'amazon',AMAZON_LAPTOP_COLLECTOR_TOKEN:'laptop',SPAWN_DB:{prepare}} as any;
  const send=(body:any)=>handleAmazonBrowser(new Request('https://spawn.test/internal/amazon-browser/observe',{method:'POST',headers:{authorization:'Bearer amazon'},body:JSON.stringify(body)}),env);
  try{
   const base=observation();expect((await send(base))?.status).toBe(200);expect((await send(base))?.status).toBe(200);
   expect((await send({...base,title:base.title+' English'}))?.status).toBe(409);
   expect((await send({...base,id:'00000000-0000-0000-0000-000000000002',observedAt:new Date(Date.now()-60000).toISOString(),state:'blocked',reason:'CHALLENGE_OR_SIGN_IN',buyingOptionsShown:null}))?.status).toBe(200);
   expect(db.prepare('SELECT COUNT(*) n FROM amazon_browser_observations').get()?.n).toBe(2);
   const response=await handleAmazonBrowser(new Request('https://spawn.test/internal/amazon-browser/status',{headers:{authorization:'Bearer amazon'}}),env);const body=await response!.json() as any;
   expect(body.rows[0].latest.id).toBe(base.id);expect(body.rows[0].latest.availabilityState).toBe('unknown');expect(body.customerAlertsEnabled).toBe(false);expect(body.rows[1].stale).toBe(true);
   const laptop=await handleAmazonBrowser(new Request('https://spawn.test/internal/amazon-browser/observe',{method:'POST',headers:{authorization:'Bearer laptop'},body:JSON.stringify({...base,id:'00000000-0000-0000-0000-000000000004',collector:'forged'})}),env);
   expect(laptop?.status).toBe(200);expect(JSON.parse(String(db.prepare('SELECT evidence_json FROM amazon_browser_observations WHERE id=?').get('00000000-0000-0000-0000-000000000004')?.evidence_json)).collector).toBe('laptop');
   db.exec("UPDATE amazon_watchlist SET lifecycle_status='REJECTED'");expect((await send({...base,id:'00000000-0000-0000-0000-000000000003'}))?.status).toBe(409);
   const plan=db.prepare('EXPLAIN QUERY PLAN SELECT evidence_json,observed_at FROM amazon_browser_observations WHERE asin=? ORDER BY observed_at DESC,received_at DESC,id DESC LIMIT 1').all(base.asin);expect(JSON.stringify(plan)).toContain('amazon_browser_observations_latest');
  }finally{db.close();}
 });
 it('bounds requests and ignores unrelated routes',async()=>{
  const env={AMAZON_COLLECTOR_TOKEN:'amazon'} as any;
  expect(await handleAmazonBrowser(new Request('https://spawn.test/unrelated'),env)).toBeNull();
  for(const [body,status] of [['{',400],[' '.repeat(4001),413]] as const)expect((await handleAmazonBrowser(new Request('https://spawn.test/internal/amazon-browser/observe',{method:'POST',headers:{authorization:'Bearer amazon'},body}),env))?.status).toBe(status);
 });
});

it('keeps validated featured-offer fields but never upgrades global inventory authority',()=>{
 const body={...observation(),state:'available',reason:'VERIFIED_FEATURED_OFFER',buyingOptionsShown:false,priceMxn:329,seller:'Amazon México',purchaseEnabled:true};
 expect(validateAmazonBrowserObservation(body)?.offer).toMatchObject({priceMxn:329,seller:'Amazon México',purchaseEnabled:true});
 expect(validateAmazonBrowserObservation(body)?.availabilityState).toBe('unknown');
 for(const patch of [{priceMxn:0},{priceMxn:'329'},{seller:''},{seller:'x'.repeat(121)},{purchaseEnabled:false}])expect(validateAmazonBrowserObservation({...body,...patch})).not.toHaveProperty('offer');
 const {priceMxn,seller,purchaseEnabled,...legacy}=body;expect(validateAmazonBrowserObservation(legacy)).not.toBeNull();expect(validateAmazonBrowserObservation(legacy)).not.toHaveProperty('offer');
});
