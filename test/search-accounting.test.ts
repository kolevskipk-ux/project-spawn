import {recordSearchAudit,searchResponseEvidence} from '../src/search-audit';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {reserveSearch,settleSearch,estimateSearchCost,emptyScanStreak,flagSearchReview,searchMonth,SEARCH_RESERVE_MICROUSD} from '../src/search-accounting';
import {runScan} from '../src/index';
import {operationsRoute} from '../src/operations';
import type {Env} from '../src/types';
let db:DatabaseSync,env:Env;
function adapter(){
  const prepare=(sql:string)=>{
    let values:unknown[]=[];
    return {bind(...args:unknown[]){values=args;return this;},async first(){return db.prepare(sql).get(...values as never[])??null;},
      async all(){return {results:db.prepare(sql).all(...values as never[]),success:true};},
      execute(){const result=db.prepare(sql).run(...values as never[]);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},async run(){return this.execute();}};
  };
  return {prepare,async batch(statements:Array<{execute:()=>unknown}>){db.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(statement.execute());db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}};
}

beforeEach(()=>{
 db=new DatabaseSync(':memory:');
 for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
 env={SPAWN_DB:adapter(),OPENAI_MODEL:'gpt-5.6-terra',SPAWN_TIMEZONE:'America/Mexico_City',SPAWN_CONFIG_VERSION:'test',OPENAI_API_KEY:'fake'} as unknown as Env;
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('Unexpected network access');}));
});
afterEach(()=>{db.close();vi.unstubAllGlobals();});
function opening(amount=0,month=searchMonth(new Date())){db.prepare('INSERT INTO search_budget_months VALUES(?,?,?,?,?)').run(month,amount,new Date().toISOString(),'test','Verified fixture');}
function scan(id:string,status='running',stamp=new Date().toISOString()) {db.prepare("INSERT INTO scan_runs(id,started_at,trigger_source,status,config_version,model) VALUES(?,?,'cron',?,'test','gpt-5.6-terra')").run(id,stamp,status);}
function payload(){return {id:'resp_fixture',model:'gpt-5.6-terra',service_tier:'default',status:'completed',usage:{input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:200,cache_write_tokens:100}},output:[{type:'web_search_call',status:'completed'}]};}
function result(listings:unknown[]=[]){return {summary:'Fixture',sources_scanned:1,listings_evaluated:listings.length,available:0,sold_out:0,unknown:listings.length,changes:[],listings};}
function mockResponse(value:unknown){vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(value))));}
async function completed(id:string,count:number,stamp:string,status='succeeded'){
 scan(id,status,stamp);await reserveSearch(env,id,new Date());await settleSearch(env,id,payload());
 db.prepare('UPDATE search_accounting SET new_listings=?,yield_recorded_at=? WHERE scan_id=?').run(count,stamp,id);
}
describe('search spend and discovery review',()=>{
 it('records request settings, provider queries and sources, and the inventory outcome without credentials or reasoning',async()=>{
  opening();db.prepare("INSERT INTO worker_state VALUES('inventory_initialized','true',?)").run(new Date().toISOString());
  const output=[{type:'web_search_call',id:'tool1',status:'completed',action:{type:'search',queries:['Pokemon preventa Mexico'],sources:[{type:'url',url:'https://retailer.example/product'}]}},{type:'reasoning',summary:'PRIVATE_REASONING'}];
  mockResponse({...payload(),output,output_text:JSON.stringify(result())});
  const run=await runScan(env,'cron');
  const events=db.prepare('SELECT event_type,details_json FROM search_audit_events WHERE scan_id=? ORDER BY id').all(run.id);
  expect(events.map(e=>e.event_type)).toEqual(['attempt_started','request_prepared','dispatch_started','http_response','provider_response','inventory_committed']);
  const evidence=JSON.parse(String(events.find(e=>e.event_type==='provider_response')?.details_json));
  expect(evidence.searches[0].action.queries).toEqual(['Pokemon preventa Mexico']);
  expect(evidence.searches[0].action.sources[0].url).toBe('https://retailer.example/product');
  expect(JSON.stringify(events)).not.toContain('PRIVATE_REASONING');
  expect(JSON.stringify(events)).not.toContain('Bearer');
  const prepared=JSON.parse(String(events.find(e=>e.event_type==='request_prepared')?.details_json));
  expect(prepared.request.include).toEqual(['web_search_call.action.sources']);
  expect(prepared.request.instructions).toContain('Watch list');
  expect(prepared.request).not.toHaveProperty('OPENAI_API_KEY');
 });
 it('retains budget skips and early job-start failures independently of scan rows',async()=>{
  await expect(runScan(env,'cron')).rejects.toThrow();
  expect(db.prepare("SELECT event_type FROM search_audit_events ORDER BY id DESC LIMIT 1").get()?.event_type).toBe('skipped');
  await expect(runScan(env,'early_asin')).rejects.toThrow();
  expect(db.prepare("SELECT event_type FROM search_audit_events ORDER BY id DESC LIMIT 1").get()?.event_type).toBe('failed');
  expect(db.prepare("SELECT COUNT(DISTINCT scan_id) n FROM search_audit_events").get()?.n).toBe(2);
  expect(fetch).not.toHaveBeenCalled();
 });
 it('prevents audit updates and deletions and labels truncated evidence with its full hash',async()=>{
  await recordSearchAudit(env,'audit-test','fixture',{text:'x'.repeat(110000)});
  const row=db.prepare('SELECT * FROM search_audit_events').get()!;
  expect(row.truncated).toBe(1);expect(String(row.details_sha256)).toHaveLength(64);
  expect(JSON.parse(String(row.details_json))).toMatchObject({truncated:true,original_characters:110011});
  expect(()=>db.exec("UPDATE search_audit_events SET event_type='changed'")).toThrow('append-only');
  expect(()=>db.exec('DELETE FROM search_audit_events')).toThrow('append-only');
 });
 it('provides a read-only audit detail and JSON export, safely escaping provider content',async()=>{
  await recordSearchAudit(env,'audit-test','fixture',{query:'<script>alert(1)</script>'});
  const owner={email:'owner@example.test',subject:'test',role:'owner' as const};
  const page=await operationsRoute(new Request('https://spawn.test/ops/search/audit?scan_id=audit-test'),env,owner);
  const body=await page!.text();expect(body).toContain('&lt;script&gt;');expect(body).not.toContain('<script>alert');
  const exported=await operationsRoute(new Request('https://spawn.test/ops/search/audit?scan_id=audit-test&format=json'),env,owner);
  expect(exported!.headers.get('content-type')).toContain('application/json');
  expect((await exported!.json() as {events:unknown[]}).events).toHaveLength(1);
  expect((await operationsRoute(new Request('https://spawn.test/ops/search/audit',{method:'POST'}),env,owner))?.status).toBe(405);
  expect(searchResponseEvidence(null)).toMatchObject({searches:[]});
 });

 it('requires a reconciled opening balance and makes no paid request',async()=>{
  await expect(runScan(env,'cron')).rejects.toMatchObject({code:'search_budget_review_required'});
  expect(fetch).not.toHaveBeenCalled();expect(db.prepare('SELECT status FROM scan_runs').get()?.status).toBe('failed');
 });
 it('atomically reserves the last budget slot for only one caller',async()=>{
  opening(140_000_000);scan('a');scan('b');
  const attempts=await Promise.allSettled([reserveSearch(env,'a',new Date()),reserveSearch(env,'b',new Date())]);
  expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
  expect(db.prepare('SELECT SUM(reserved_microusd) n FROM search_accounting').get()?.n).toBe(SEARCH_RESERVE_MICROUSD);
 });
 it('includes cache writes, cached input, output and web calls without double counting search tokens',()=>{
  expect(estimateSearchCost(payload())).toEqual({microusd:12890,webCalls:1});
  expect(estimateSearchCost({...payload(),usage:undefined})).toBeNull();
  expect(estimateSearchCost({...payload(),service_tier:'priority'})).toBeNull();
  expect(estimateSearchCost({...payload(),model:'different'})).toBeNull();
 });
 it('settles only once and retains unknown usage reserves',async()=>{
  opening();scan('a');await reserveSearch(env,'a',new Date());
  await settleSearch(env,'a',payload());await settleSearch(env,'a',{...payload(),usage:{input_tokens:9999,output_tokens:9999}});
  expect(db.prepare('SELECT estimated_microusd FROM search_accounting').get()?.estimated_microusd).toBe(12890);
  scan('b');await reserveSearch(env,'b',new Date());await settleSearch(env,'b',{id:'missing'});
  expect(db.prepare("SELECT estimated_microusd,reserved_microusd FROM search_accounting WHERE scan_id='b'").get()).toMatchObject({estimated_microusd:null,reserved_microusd:SEARCH_RESERVE_MICROUSD});
 });
 it('keeps charges for malformed or incomplete responses and excludes them from empty scans',async()=>{
  opening();mockResponse({...payload(),output_text:'invalid JSON'});
  await expect(runScan(env,'cron')).rejects.toThrow();
  expect(db.prepare('SELECT estimated_microusd FROM search_accounting').get()?.estimated_microusd).toBe(12890);
  expect(await emptyScanStreak(env)).toBe(0);
  mockResponse({...payload(),status:'incomplete',output_text:JSON.stringify(result())});
  await expect(runScan(env,'cron')).rejects.toThrow('Search incomplete');
  expect(await emptyScanStreak(env)).toBe(0);
 });
 it('retains a reservation on a network failure and does not advance discovery yield',async()=>{
  opening();await expect(runScan(env,'cron')).rejects.toThrow('Unexpected network access');
  expect(db.prepare('SELECT estimated_microusd,reserved_microusd FROM search_accounting').get()).toMatchObject({estimated_microusd:null,reserved_microusd:SEARCH_RESERVE_MICROUSD});
  expect(await emptyScanStreak(env)).toBe(0);
 });
 it('counts repeated listings as empty discovery and restocks separately',async()=>{
  opening();db.prepare("INSERT INTO worker_state VALUES('inventory_initialized','true',?)").run(new Date().toISOString());
  const listing={title:'Fixture sealed cards',watch_category:'delta_reign',retailer:'Fixture retailer',retailer_sku:null,url:'https://fixture.example/product/one',status:'sold_out',price_mxn:100,language:'unknown',language_evidence:'Unconfirmed',msrp_mxn:null,msrp_source_url:null,evidence:'Fixture'};
  mockResponse({...payload(),output_text:JSON.stringify(result([listing]))});await runScan(env,'cron');
  expect(await emptyScanStreak(env)).toBe(0);
  mockResponse({...payload(),output_text:JSON.stringify(result([{...listing,status:'available'}]))});await runScan(env,'cron');
  expect(await emptyScanStreak(env)).toBe(1);
  expect(db.prepare('SELECT SUM(new_listings) n,SUM(restocks) r FROM search_accounting').get()).toMatchObject({n:1,r:1});
  const body=JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
  expect(body).toMatchObject({max_tool_calls:12,max_output_tokens:16000,service_tier:'default',tool_choice:'required'});
 });
 it('flags exactly at 100, ignores failures, resets on new listings, and preserves the pending review',async()=>{
  opening();const base=Date.now()-200_000;
  for(let i=1;i<=99;i++)await completed('s'+i,0,new Date(base+i*1000).toISOString());
  await flagSearchReview(env,'s99');expect(db.prepare('SELECT COUNT(*) n FROM search_reviews').get()?.n).toBe(0);
  await completed('failure',0,new Date(base+100_000).toISOString(),'failed');expect(await emptyScanStreak(env)).toBe(99);
  await completed('hundred',0,new Date(base+101_000).toISOString());await flagSearchReview(env,'hundred');
  expect(await emptyScanStreak(env)).toBe(100);expect(db.prepare('SELECT COUNT(*) n FROM search_reviews').get()?.n).toBe(1);
  await completed('new',1,new Date(base+102_000).toISOString());await flagSearchReview(env,'new');
  expect(await emptyScanStreak(env)).toBe(0);expect(db.prepare('SELECT COUNT(*) n FROM search_reviews WHERE reviewed_at IS NULL').get()?.n).toBe(1);
 });
 it('uses Mexico calendar months and automatically opens subsequent tracked months',async()=>{
  expect(searchMonth(new Date('2026-10-01T05:59:59Z'))).toBe('2026-09');
  expect(searchMonth(new Date('2026-10-01T06:00:00Z'))).toBe('2026-10');
  opening(150_000_000,'2026-09');scan('october');await reserveSearch(env,'october',new Date('2026-10-01T06:00:00Z'));
  expect(db.prepare("SELECT opening_microusd FROM search_budget_months WHERE month='2026-10'").get()?.opening_microusd).toBe(0);
 });
 it('blocks new requests after an estimate exceeds its reservation',async()=>{
  opening();scan('a');await reserveSearch(env,'a',new Date());
  await settleSearch(env,'a',{...payload(),usage:{input_tokens:4_000_000,output_tokens:100}});
  scan('b');await expect(reserveSearch(env,'b',new Date())).rejects.toMatchObject({code:'search_budget_review_required'});
 });
 it('renders the protected budget page and limits reconciliation to the owner',async()=>{
  const owner={email:'owner@example.test',subject:'test',role:'owner' as const};
  const get=await operationsRoute(new Request('https://spawn.test/ops/search'),env,owner);
  expect(await get!.text()).toContain('Opening spend required');
  const makeRequest=()=>new Request('https://spawn.test/ops/search',{method:'POST',body:new URLSearchParams({action:'opening_balance',month:searchMonth(new Date()),opening_usd:'12.34',reason:'Verified billing fixture'})});
  expect((await operationsRoute(makeRequest(),env,{...owner,role:'admin'}))?.status).toBe(403);
  expect((await operationsRoute(makeRequest(),env,owner))?.status).toBe(303);
  expect((await operationsRoute(makeRequest(),env,owner))?.status).toBe(409);
  expect(db.prepare('SELECT opening_microusd FROM search_budget_months').get()?.opening_microusd).toBe(12_340_000);
 });
});
