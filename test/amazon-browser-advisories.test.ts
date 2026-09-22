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
 const observe=(flag:number|null,minute:number)=>{const time=new Date(base+minute*60000).toISOString();db.prepare('INSERT INTO amazon_browser_observations VALUES(?,?,?,?,?,?,?)').run(`obs-${++seq}`,asin,time,time,'test',flag,'{}');};
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
