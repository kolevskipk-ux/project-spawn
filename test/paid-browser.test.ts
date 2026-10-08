import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {approvePaidBrowserFallback,disablePaidBrowserFallback,paidBrowserPolicy,handlePaidBrowserPolicy} from '../src/paid-browser-fallback';
import {paidBrowserOperations} from '../src/paid-browser-operations';
const now=new Date('2026-10-07T20:00:00Z'),usage={msUsed:36000000,periodStart:'2026-09-22T00:00:00.000Z'};
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE worker_state(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 const prepare=(sql:string)=>{let args:any[]=[];return {bind(...v:any[]){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};};
 return {db,env:{SPAWN_DB:{prepare},CATCH_INGEST_SECRET:'fixture',SCOUT_HEALTH_ALERTS_ENABLED:'true'} as any};
}
const owner={email:'owner@example.test',subject:'owner',role:'owner' as const};
const form=(action:string,origin='https://ops.test')=>new Request('https://ops.test/ops/browser-fallback',{method:'POST',headers:{origin},body:new URLSearchParams({action})});
const reported=async()=>Response.json({paidBrowserFallbackSupported:true,health:{browserUsage:usage}});
describe('paid browser fallback',()=>{
 it('grants 15 minutes once, rejects a duplicate, expires after four hours, and can be stopped',async()=>{const f=fixture();try{
 const p=await approvePaidBrowserFallback(f.env,owner.email,usage,now);
 expect(p.maxCapMs).toBe(36900000);expect(p.expiresAt).toBe('2026-10-08T00:00:00.000Z');
 await expect(approvePaidBrowserFallback(f.env,owner.email,usage,now)).rejects.toThrow('already enabled');
 expect((await paidBrowserPolicy(f.env,new Date('2026-10-08T00:00:00Z')))?.enabled).toBe(false);
 expect(await disablePaidBrowserFallback(f.env,'scout_recovered',now)).toBe(true);
 expect((await paidBrowserPolicy(f.env,now))?.disabledReason).toBe('scout_recovered');
 expect(await disablePaidBrowserFallback(f.env,'again',now)).toBe(false);
 }finally{f.db.close();}});
 it('protects the internal read-only policy endpoint',async()=>{const f=fixture();try{
 const url='https://spawn.test/internal/garfield/browser-fallback';
 expect((await handlePaidBrowserPolicy(new Request(url),f.env))?.status).toBe(401);
 expect((await handlePaidBrowserPolicy(new Request(url,{method:'POST',headers:{authorization:'Bearer fixture'}}),f.env))?.status).toBe(405);
 const result=await handlePaidBrowserPolicy(new Request(url,{headers:{authorization:'Bearer fixture'}}),f.env);
 expect(await result?.json()).toEqual({enabled:false});
 }finally{f.db.close();}});
 it('requires owner approval, same-site forms and live compatible usage',async()=>{const f=fixture();try{
 expect((await paidBrowserOperations(form('enable','https://other.test'),f.env,owner,reported as any)).status).toBe(403);
 expect((await paidBrowserOperations(form('enable'),f.env,{...owner,role:'admin'},reported as any)).status).toBe(403);
 expect((await paidBrowserOperations(form('disable'),f.env,{...owner,role:'viewer'},reported as any)).status).toBe(403);
 expect((await paidBrowserOperations(form('enable'),f.env,owner,(async()=>new Response(null,{status:503})) as any)).status).toBe(409);
 expect((await paidBrowserOperations(form('enable'),f.env,owner,reported as any)).status).toBe(303);
 expect((await paidBrowserPolicy(f.env))?.enabled).toBe(true);
 const page=await paidBrowserOperations(new Request('https://ops.test/ops/browser-fallback'),f.env,owner,reported as any);
 expect(await page.text()).toContain('Turn off paid fallback');
 expect((await paidBrowserOperations(form('disable'),f.env,owner,reported as any)).status).toBe(303);
 expect((await paidBrowserPolicy(f.env))?.enabled).toBe(false);
 }finally{f.db.close();}});
});
