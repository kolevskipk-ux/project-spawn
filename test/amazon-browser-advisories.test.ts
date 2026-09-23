import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {claimAmazonBrowserAdvisories,handleAmazonBrowserAdvisories} from '../src/amazon-browser-advisories';
const asin='B0H77VYKSM',base=Date.parse('2026-09-22T02:00:00Z');
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0046_amazon_browser_observations.sql','0047_amazon_browser_advisories.sql'])db.exec(readFileSync(`migrations/${file}`,'utf8'));
 db.exec(`CREATE TABLE amazon_watchlist(asin TEXT PRIMARY KEY,lifecycle_status TEXT,watch_category TEXT); INSERT INTO amazon_watchlist VALUES('${asin}','PUBLISHED','30th_celebration');`);
 const prepare=(sql:string)=>{let args:any[]=[];return {bind(...v:any[]){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async run(){return db.prepare(sql).run(...args);}};};
 const env={CATCH_INGEST_SECRET:'catch',AMAZON_BROWSER_ADVISORIES_ENABLED:'true',SPAWN_DB:{prepare,async batch(stmts:any[]){db.exec('BEGIN');try{for(const stmt of stmts)await stmt.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}}} as any;
 let seq=0;
 const observe=(flag:number|null,minute:number,offer?:any)=>{const time=new Date(base+minute*60000).toISOString();db.prepare('INSERT INTO amazon_browser_observations VALUES(?,?,?,?,?,?,?)').run(`obs-${++seq}`,asin,time,time,offer?'available':flag===1?'buying_options_shown':flag===0?'sold_out':'unknown',flag,JSON.stringify(offer?{offer}:{}));};
 const poll=(minute:number)=>claimAmazonBrowserAdvisories(env,new Date(base+minute*60000));
 const ack=(event:any,status='DELIVERED',token=event.claim_token)=>handleAmazonBrowserAdvisories(new Request('https://spawn.test/internal/garfield/amazon-browser-advisories/ack',{method:'POST',headers:{authorization:'Bearer catch'},body:JSON.stringify({id:event.id,claim_token:token,status})}),env);
 return {db,env,observe,poll,ack};
}
describe('Amazon advisory outbox',()=>{
 it('claims once across collectors, retries after lease and acknowledges idempotently',async()=>{
  const f=fixture();try{
   f.observe(1,0);const [first]=await f.poll(0);expect(first.stock_verified).toBe(false);
   expect(await f.poll(1)).toEqual([]);f.observe(1,1);expect(await f.poll(1)).toEqual([]);
   const [retry]=await f.poll(2);expect(retry.id).toBe(first.id);expect(retry.claim_token).not.toBe(first.claim_token);
   expect((await f.ack(first))?.status).toBe(409);expect((await f.ack(retry))?.status).toBe(200);
   expect((await f.ack(retry))?.status).toBe(200);expect(await f.poll(4)).toEqual([]);
   expect(f.db.prepare('SELECT COUNT(*) n FROM amazon_browser_advisories').get()?.n).toBe(1);
  }finally{f.db.close();}
 });
 it('unknown does not rearm; confirmed absence rearms subject to an hour cooldown',async()=>{
  const f=fixture();try{
   f.observe(1,0);await f.ack((await f.poll(0))[0]);
   f.observe(null,2);expect(await f.poll(2)).toEqual([]);
   f.observe(1,4);expect(await f.poll(4)).toEqual([]);
   f.observe(0,5);await f.poll(5);f.observe(1,6);expect(await f.poll(6)).toEqual([]);
   f.observe(1,61);expect(await f.poll(61)).toEqual([]);
   f.observe(0,62);await f.poll(62);f.observe(1,63);expect(await f.poll(63)).toHaveLength(1);
  }finally{f.db.close();}
 });
 it('expires pending episodes on absence and never delivers stale or unpublished products',async()=>{
  const f=fixture();try{
   f.observe(1,0);await f.poll(0);f.observe(0,1);expect(await f.poll(1)).toEqual([]);
   expect(f.db.prepare('SELECT status FROM amazon_browser_advisories').get()?.status).toBe('EXPIRED');
   f.observe(1,61);expect(await f.poll(72)).toEqual([]);expect(await f.poll(60)).toEqual([]);
   f.db.exec("UPDATE amazon_watchlist SET lifecycle_status='REJECTED'");expect(await f.poll(62)).toEqual([]);
  }finally{f.db.close();}
 });
 it('failed delivery waits for lease and cannot retry after evidence expires',async()=>{
  const f=fixture();try{f.observe(1,0);const [e]=await f.poll(0);expect((await f.ack(e,'FAILED'))?.status).toBe(200);expect(await f.poll(1)).toEqual([]);expect(await f.poll(2)).toHaveLength(1);expect(await f.poll(10)).toEqual([]);}finally{f.db.close();}
 });
 it('authenticates before accessing the database and supports disabling the feed',async()=>{
  const request=(token:string)=>new Request('https://spawn.test/internal/garfield/amazon-browser-advisories/claim',{method:'POST',headers:{authorization:`Bearer ${token}`}});
  expect((await handleAmazonBrowserAdvisories(request('collector'),{CATCH_INGEST_SECRET:'catch'} as any))?.status).toBe(401);
  expect(await (await handleAmazonBrowserAdvisories(request('catch'),{CATCH_INGEST_SECRET:'catch'} as any))?.json()).toEqual({events:[],enabled:false});
 });
});

const featuredOffer={priceMxn:329,seller:'Amazon México',purchaseEnabled:true};
describe('Featured browser offers',()=>{
 it('delivers featured details, deduplicates collectors and retains original retry evidence',async()=>{
  const f=fixture();try{
   f.observe(0,0,featuredOffer);const [first]=await f.poll(0);
   expect(first.kind).toBe('FEATURED_OFFER_AVAILABLE');expect(first.offer).toEqual(featuredOffer);
   f.observe(0,1,{...featuredOffer,priceMxn:400});expect(await f.poll(1)).toEqual([]);
   const [retry]=await f.poll(2);expect(retry.id).toBe(first.id);expect(retry.offer.priceMxn).toBe(329);
   await f.ack(retry);expect(await f.poll(3)).toEqual([]);
   f.observe(null,4);await f.poll(4);f.observe(0,5,featuredOffer);expect(await f.poll(5)).toEqual([]);
   f.observe(0,62);await f.poll(62);f.observe(0,63,featuredOffer);expect(await f.poll(63)).toHaveLength(1);
  }finally{f.db.close();}
 });
 it('upgrades options promptly, expires pending weaker alerts and does not repeat on oscillation',async()=>{
  const f=fixture();try{
   f.observe(1,0);const [options]=await f.poll(0);
   f.observe(0,1,featuredOffer);const [upgraded]=await f.poll(1);
   expect(upgraded.kind).toBe('FEATURED_OFFER_AVAILABLE');
   expect(f.db.prepare('SELECT status FROM amazon_browser_advisories WHERE id=?').get(options.id)?.status).toBe('EXPIRED');
   await f.ack(upgraded);f.observe(1,2);expect(await f.poll(2)).toEqual([]);
   f.observe(0,3,featuredOffer);expect(await f.poll(3)).toEqual([]);
  }finally{f.db.close();}
 });
 it('does not promote legacy or malformed offer evidence, and expires withdrawn offers',async()=>{
  const f=fixture();try{
   f.observe(0,0,{priceMxn:329});expect(await f.poll(0)).toEqual([]);
   f.observe(0,1,featuredOffer);const [e]=await f.poll(1);expect(e).toBeTruthy();
   f.observe(0,2);expect(await f.poll(2)).toEqual([]);
   expect(f.db.prepare('SELECT status FROM amazon_browser_advisories WHERE id=?').get(e.id)?.status).toBe('EXPIRED');
  }finally{f.db.close();}
 });
});

it('carries a real extension offer through intake, outbox and the Catch Discord formatter',async()=>{
 const f=fixture();try{
  const {handleAmazonBrowser}=await import('../src/amazon-browser');
  const transportPath='../collector/amazon-extension/transport.js';
  const catchPath='../../catch-em-all/src/amazon-browser-advisories.js';
  const {intakeRecord}=await import(transportPath);
  const {deliverBrowserAdvisories}=await import(catchPath);
  f.env.AMAZON_COLLECTOR_TOKEN='fixture-collector';
  const now=Date.now(),record=intakeRecord({id:crypto.randomUUID(),asin,url:`https://www.amazon.com.mx/dp/${asin}`,title:'30th Ultra-Premium Collection Day',observedAt:new Date(now).toISOString(),state:'available',reason:'VERIFIED_FEATURED_OFFER',buyingOptionsShown:false,...featuredOffer});
  const response=await handleAmazonBrowser(new Request('https://spawn.test/internal/amazon-browser/observe',{method:'POST',headers:{authorization:'Bearer fixture-collector'},body:JSON.stringify(record)}),f.env);
  expect(response?.status).toBe(200);
  const cache=new Map(),posts:any[]=[];
  const result=await deliverBrowserAdvisories({AMAZON_BROWSER_ADVISORIES_ENABLED:'true',CATCH_INGEST_SECRET:'catch',POKEMON_30TH_HUNT:'https://discord.com/api/webhooks/fixture/test',STATE:{get:async(k:string)=>cache.get(k),put:async(k:string,v:string)=>cache.set(k,v)}},{products:[{asin,name:'Day UPC',routingKey:'pokemon-30th'}],now:()=>now+1000,spawnFetch:async(path:string,init:any)=>path.endsWith('/claim')?Response.json({events:await f.poll((now+1000-base)/60000)}):handleAmazonBrowserAdvisories(new Request('https://spawn.test'+path,init),f.env),fetchFn:async(_url:string,init:any)=>{posts.push(JSON.parse(init.body));return new Response(null,{status:200});}});
  expect(result.results[0]).toMatchObject({status:'DELIVERED',acknowledged:true});
  expect(posts[0].embeds[0].description).toContain('Amazon México');expect(posts[0].embeds[0].description).toContain('329');
  expect(f.db.prepare('SELECT status FROM amazon_browser_advisories').get()?.status).toBe('DELIVERED');
 }finally{f.db.close();}
});
