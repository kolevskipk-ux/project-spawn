import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {dropRecoveryRoute,executeDropSearch,searchSignal,validDropTarget} from '../src/drop-recovery';
import type {Env} from '../src/types';
let db:DatabaseSync,env:Env,tasks:Promise<unknown>[];
const now=Date.parse('2026-09-10T22:30:00Z'),asin='B0H783FY5Z';
const request=(path='drop-recovery',extra={})=>new Request(`https://spawn.test/internal/garfield/${path}`,{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify({asin,windowStart:now,...extra})});
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);tasks=[];db=new DatabaseSync(':memory:');
 for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
 const prepare=(sql:string)=>{let values:any[]=[];return {bind(...args:any[]){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values),success:true};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}};};
 env={SPAWN_DB:{prepare},CATCH_INGEST_SECRET:'fixture',SPAWN_TIMEZONE:'America/Mexico_City',OPENAI_MODEL:'gpt-5.6-terra',OPENAI_API_KEY:'fake',SPAWN_CONFIG_VERSION:'test',AMAZON_DROP_SEARCH_ENABLED:'true',AMAZON_DROP_SEARCH_BUDGET_USD:'1'} as unknown as Env;
 db.prepare(`INSERT OR REPLACE INTO amazon_watchlist(asin,canonical_product_id,product_name,product_url,watch_category,language,priority,lane,lifecycle_status,routing_key,source,approved_by,approved_at,first_discovered_at,last_discovered_at,updated_at) VALUES(?,'bundle','Bundle',?,'30th_celebration','english','HIGH','normal','PUBLISHED','pokemon-main','fixture','philip',?,?,?,?)`).run(asin,`https://www.amazon.com.mx/dp/${asin}`,...Array(4).fill(new Date(now).toISOString()));
 db.prepare('INSERT INTO search_budget_months VALUES(?,?,?,?,?)').run('2026-09',0,new Date(now).toISOString(),'test','fixture');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({id:'response',model:'gpt-5.6-terra',service_tier:'default',status:'completed',usage:{input_tokens:1000,output_tokens:100},output:[{type:'web_search_call',status:'completed',action:{sources:[]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({asin,state:'UNKNOWN'})}]}]})));
});
afterEach(async()=>{await Promise.all(tasks);vi.unstubAllGlobals();vi.useRealTimers();db.close();});
const ctx=()=>({waitUntil(p:Promise<unknown>){tasks.push(p);}} as ExecutionContext);
it('accepts a published hot target once and invokes at most one paid search',async()=>{
 const response=await dropRecoveryRoute(request(),env,ctx(),now);expect(response?.status).toBe(202);
 await Promise.all(tasks);
 const again=await dropRecoveryRoute(request(),env,ctx(),now);expect((await again!.json() as any).accepted).toBe(true);
 await executeDropSearch(env,`drop-${now}-${asin}`);
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(db.prepare('SELECT status,signal FROM amazon_drop_jobs').get()).toMatchObject({status:'COMPLETED',signal:'UNKNOWN'});
 expect(db.prepare('SELECT estimated_microusd FROM search_accounting').get()).toMatchObject({estimated_microusd:13200});
});
it('does not transfer ownership without an explicit budget or enabled service',async()=>{
 env.AMAZON_DROP_SEARCH_BUDGET_USD='0';expect((await dropRecoveryRoute(request(),env,ctx(),now))?.status).toBe(503);
 expect(fetch).not.toHaveBeenCalled();
});
it('respects the shared search budget before accepting a fallback',async()=>{
 db.exec('UPDATE search_budget_months SET opening_microusd=150000000');
 expect((await dropRecoveryRoute(request(),env,ctx(),now))?.status).toBe(503);expect(fetch).not.toHaveBeenCalled();
 expect(db.prepare('SELECT status FROM amazon_drop_jobs').get()).toMatchObject({status:'FAILED'});
});
it('requires authentication, exact published hot identity, and a current window',async()=>{
 db.prepare("UPDATE amazon_watchlist SET lifecycle_status='SUSPENDED' WHERE asin='B0H77VYKSM'").run();
 const unauthorized=request();unauthorized.headers.delete('authorization');expect((await dropRecoveryRoute(unauthorized,env,ctx(),now))?.status).toBe(401);
 expect((await dropRecoveryRoute(request('drop-recovery',{asin:'B0H77VYKSM'}),env,ctx(),now))?.status).toBe(409);
 expect(validDropTarget(asin,now,now+180000)).toBe(false);expect(validDropTarget(asin,now+1,now+1)).toBe(false);
});
it('serializes overlapping checks and releases only the matching owner',async()=>{
 const first=await (await dropRecoveryRoute(request('drop-check'),env,ctx(),now))!.json() as any;
 expect(first.claimed).toBe(true);
 expect((await (await dropRecoveryRoute(request('drop-check'),env,ctx(),now+60000))!.json() as any).claimed).toBe(false);
 await dropRecoveryRoute(request('drop-check',{release:true,owner:first.owner}),env,ctx(),now+61000);
 expect((await (await dropRecoveryRoute(request('drop-check'),env,ctx(),now+62000))!.json() as any).claimed).toBe(true);
});
it('retains uncertain charges and does not retry a failed paid call',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('timeout');}));
 await dropRecoveryRoute(request(),env,ctx(),now);await Promise.all(tasks);
 await executeDropSearch(env,`drop-${now}-${asin}`);expect(fetch).toHaveBeenCalledTimes(1);
 expect(db.prepare('SELECT estimated_microusd,reserved_microusd FROM search_accounting').get()).toMatchObject({estimated_microusd:null,reserved_microusd:500000});
});
it('rejects invented signals and sources for a different ASIN',()=>{
 const payload={output:[{type:'web_search_call',status:'completed',action:{sources:[{url:'https://www.amazon.com.mx/dp/B0H77VYKSM'}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({asin,state:'BUYABLE'})}]}]};
 expect(searchSignal(payload,asin).signal).toBe('UNKNOWN');
 payload.output[0].action!.sources[0].url=`https://www.amazon.com.mx/dp/${asin}`;
 expect(searchSignal(payload,asin).signal).toBe('POSSIBLY_BUYABLE');
});

