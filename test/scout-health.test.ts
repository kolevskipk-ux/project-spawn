import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {scoutHealthDecision,scoutAlertHours,recordScoutHeartbeat,monitorScoutHealth,type HealthState} from '../src/scout-health';
import {handleAmazonBrowser} from '../src/amazon-browser';
const now=Date.parse('2026-10-03T20:00:00Z'),hot='B0H77VYKSM',warm='B0HG3RVZLW';
const state:HealthState={armedAt:new Date(now-600000).toISOString(),incident:false,severity:null,notifiedSeverity:null,healthySamples:0,lastSampleAt:null};
const target=(asin:string,age:number)=>({asin,name:asin,observedAt:new Date(now-age).toISOString()});
function fixture(){const db=new DatabaseSync(':memory:');db.exec(readFileSync('migrations/0046_amazon_browser_observations.sql','utf8'));db.exec('CREATE TABLE worker_state(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE scan_locks(name TEXT PRIMARY KEY,owner TEXT,acquired_at TEXT,expires_at TEXT);CREATE TABLE amazon_watchlist(asin TEXT PRIMARY KEY,lifecycle_status TEXT);');db.prepare('INSERT INTO amazon_watchlist VALUES(?,?)').run(hot,'PUBLISHED');
 const prepare=(sql:string)=>{let args:any[]=[];return {bind(...v:any[]){args=v;return this;},async first(column?:string){const row=db.prepare(sql).get(...args);return row?(column?row[column]:row):null;},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};};
 const env:any={SCOUT_HEALTH_ALERTS_ENABLED:'true',AMAZON_COLLECTOR_TOKEN:'fixture',OPS_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/fixture/fixture',SPAWN_DB:{prepare}};
 const set=(key:string,value:any)=>db.prepare('INSERT OR REPLACE INTO worker_state VALUES(?,?,?)').run(key,JSON.stringify(value),new Date(now).toISOString());
 const observe=(time:number,status='sold_out',id=crypto.randomUUID())=>db.prepare('INSERT INTO amazon_browser_observations VALUES(?,?,?,?,?,?,?)').run(id,hot,new Date(time).toISOString(),new Date(time).toISOString(),status,0,'{}');return {db,env,set,observe};}
describe('Scout health notifications',()=>{
 it('uses per-product freshness and does not equate activity with coverage',()=>{expect(scoutHealthDecision([target(hot,300001),target(warm,300001)],[],state,now).missing.map(x=>x.asin)).toEqual([hot]);expect(scoutHealthDecision([target(hot,0),target(warm,900001)],[],state,now).severity).toBe('partial');});
 it('alerts immediately by day, escalates severity and does not repeat every 30 minutes',()=>{const prior={...state,incident:true,notifiedSeverity:'partial',lastNotifiedAt:new Date(now-60000).toISOString()};expect(scoutHealthDecision([target(hot,400000),target(warm,0)],[],prior,now).alert).toBe(false);expect(scoutHealthDecision([target(hot,400000),target(warm,1000000)],[],prior,now).alert).toBe(true);expect(scoutHealthDecision([target(hot,400000)],[],{...prior,notifiedSeverity:'offline'},now+1800000).alert).toBe(false);});
 it('defers overnight outages to 07:00 even if they recovered, with exact local boundaries',()=>{
 const at=(local:string)=>Date.parse(local+'-06:00');
 expect(scoutAlertHours(at('2026-10-06T21:29:00')).overnight).toBe(false);
 expect(scoutAlertHours(at('2026-10-06T21:30:00')).overnight).toBe(true);
 expect(scoutAlertHours(at('2026-10-07T05:59:00')).overnight).toBe(true);
 expect(scoutAlertHours(at('2026-10-07T06:00:00')).overnight).toBe(false);
 const night=at('2026-10-06T22:00:00');
 const d=scoutHealthDecision([{asin:hot,name:hot,observedAt:null}],[],{...state,armedAt:new Date(night-600000).toISOString()},night);
 expect(d.alert).toBe(false);expect(d.overnightDueAt).toBe('2026-10-07T13:00:00.000Z');
 const pending={...state,incident:true,overnightDueAt:d.overnightDueAt,overnightRecoveredAt:'2026-10-07T11:00:00Z'};
 const six=at('2026-10-07T06:30:00');expect(scoutHealthDecision([{asin:hot,name:hot,observedAt:new Date(six).toISOString()}],[],pending,six).alert).toBe(false);
 const seven=at('2026-10-07T07:00:00');expect(scoutHealthDecision([{asin:hot,name:hot,observedAt:new Date(seven).toISOString()}],[],pending,seven).morning).toBe(true);
 });
 it('does not recover across non-consecutive samples',()=>{
 expect(scoutHealthDecision([target(hot,0)],[],{...state,incident:true,notifiedSeverity:'offline',healthySamples:1,lastSampleAt:new Date(now-3600000).toISOString()},now).recovery).toBe(false);
 });
 it('requires two healthy checks and ignores one broken collector if another is healthy',()=>{const prior={...state,incident:true,notifiedSeverity:'offline',healthySamples:1,lastSampleAt:new Date(now-60000).toISOString()};expect(scoutHealthDecision([target(hot,0)],[],prior,now).recovery).toBe(true);const beats=[{receivedAt:new Date(now).toISOString(),enabled:true,manualPaused:false,stopReason:null,challengeAttempts:0,pauseUntil:null},{receivedAt:new Date(now).toISOString(),enabled:false,manualPaused:false,stopReason:'READ_FAILURES',challengeAttempts:0,pauseUntil:null}];expect(scoutHealthDecision([target(hot,0)],beats,state,now).severity).toBeNull();});
 it('accepts only scoped authenticated heartbeat and bounds manual-pause suppression',async()=>{const f=fixture();try{const body={enabled:false,manualPaused:true,stopReason:null,challengeAttempts:0};const request=()=>new Request('https://spawn.test/internal/amazon-browser/heartbeat',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify(body)});expect((await handleAmazonBrowser(new Request('https://spawn.test/internal/amazon-browser/heartbeat',{method:'POST',body:JSON.stringify(body)}),f.env))?.status).toBe(401);const a=await recordScoutHeartbeat(request(),f.env,'desktop',new Date(now));const b=await recordScoutHeartbeat(request(),f.env,'desktop',new Date(now+60000));expect((await a.json() as any).pauseUntil).toBe((await b.json() as any).pauseUntil);const beat=JSON.parse(String(f.db.prepare('SELECT value FROM worker_state').get()?.value));expect(scoutHealthDecision([target(hot,400000)],[beat],state,now).paused).toBe(true);expect(scoutHealthDecision([target(hot,400000)],[beat],state,now+7200001).paused).toBe(false);const bad=await recordScoutHeartbeat(new Request('https://test',{method:'POST',body:JSON.stringify({...body,challengeAttempts:-1})}),f.env,'desktop');expect(bad.status).toBe(400);}finally{f.db.close();}});
 it('persists incidents, retries failed notices and waits for stable recovery',async()=>{const f=fixture();let sends=0;try{f.set('scout:health-state',state);const failed=async()=>{sends++;return new Response(null,{status:503});};const ok=async()=>{sends++;return new Response(null,{status:200});};await monitorScoutHealth(f.env,new Date(now),failed as any);await monitorScoutHealth(f.env,new Date(now+60000),ok as any);await monitorScoutHealth(f.env,new Date(now+120000),ok as any);expect(sends).toBe(2);f.observe(now+180000);await monitorScoutHealth(f.env,new Date(now+180000),ok as any);expect(sends).toBe(2);await monitorScoutHealth(f.env,new Date(now+180100),ok as any);expect(sends).toBe(2);await monitorScoutHealth(f.env,new Date(now+240000),ok as any);expect(sends).toBe(3);expect(JSON.parse(String(f.db.prepare("SELECT value FROM worker_state WHERE key='scout:health-state'").get()?.value)).incident).toBe(false);}finally{f.db.close();}});
 it('blocked/error reports do not refresh coverage; locks prevent concurrent sends',async()=>{const f=fixture();try{f.set('scout:health-state',state);f.observe(now,'blocked');f.db.prepare('INSERT INTO scan_locks VALUES(?,?,?,?)').run('scout_health','other',new Date(now).toISOString(),new Date(now+60000).toISOString());let sent=false;await monitorScoutHealth(f.env,new Date(now),(async()=>{sent=true;return new Response();}) as any);expect(sent).toBe(false);f.db.exec('DELETE FROM scan_locks');await monitorScoutHealth(f.env,new Date(now),(async()=>{sent=true;return new Response();}) as any);expect(sent).toBe(true);}finally{f.db.close();}});
 it('records delivery failures and Discord receipts without webhook secrets',async()=>{const f=fixture();try{
 f.set('scout:health-state',state);
 await monitorScoutHealth(f.env,new Date(now),(async()=>{throw Error('network');}) as any);
 const latest=()=>JSON.parse(String(f.db.prepare("SELECT value FROM worker_state WHERE key='scout:health-latest'").get()?.value));
 expect(latest().deliveryStatus).toBe('request_failure');
 await monitorScoutHealth(f.env,new Date(now+60000),(async()=>Response.json({id:'message',channel_id:'channel'})) as any);
 expect(latest().messageId).toBe('message');expect(latest().channelId).toBe('channel');
 const events=f.db.prepare("SELECT value FROM worker_state WHERE key LIKE 'scout:health-event:%'").all();expect(events).toHaveLength(2);expect(JSON.stringify(events)).not.toContain('/api/webhooks/');
 }finally{f.db.close();}});
 it('retains a recovered overnight gap until 07:00 and retries a failed morning summary',async()=>{const f=fixture();let sends=0;try{
 const night=Date.parse('2026-10-06T22:00:00-06:00');f.set('scout:health-state',{...state,armedAt:new Date(night-600000).toISOString()});
 const send=async()=>{sends++;return Response.json({id:'receipt',channel_id:'channel'});};
 await monitorScoutHealth(f.env,new Date(night),send as any);expect(sends).toBe(0);
 const early=Date.parse('2026-10-07T04:00:00-06:00');f.observe(early);await monitorScoutHealth(f.env,new Date(early),send as any);await monitorScoutHealth(f.env,new Date(early+60000),send as any);expect(sends).toBe(0);
 const seven=Date.parse('2026-10-07T07:00:00-06:00');f.observe(seven);
 await monitorScoutHealth(f.env,new Date(seven),(async()=>{sends++;return new Response(null,{status:503});}) as any);
 let current=JSON.parse(String(f.db.prepare("SELECT value FROM worker_state WHERE key='scout:health-state'").get()?.value));expect(current.overnightDueAt).toBeTruthy();
 let message='';await monitorScoutHealth(f.env,new Date(seven+60000),(async(_url:any,init:any)=>{sends++;message=JSON.parse(init.body).content;return Response.json({id:'receipt',channel_id:'channel'});}) as any);
 expect(sends).toBe(2);expect(message).toContain('Fresh coverage recovered');expect(message).toContain('https://spawn.aztlan-eng.com/ops/browser-fallback');expect(message.length).toBeLessThanOrEqual(2000);
 current=JSON.parse(String(f.db.prepare("SELECT value FROM worker_state WHERE key='scout:health-state'").get()?.value));expect(current.overnightDueAt).toBeNull();expect(current.incident).toBe(false);
 }finally{f.db.close();}});
 it('switches off paid fallback on stable Scout coverage without requiring a prior outage notice',async()=>{const f=fixture();try{
 f.set('scout:health-state',{...state,healthySamples:1,lastSampleAt:new Date(now-60000).toISOString()});
 f.set('browser:paid-fallback',{enabled:true,id:'approval',expiresAt:new Date(now+3600000).toISOString()});f.observe(now);
 await monitorScoutHealth(f.env,new Date(now),(async()=>new Response()) as any);
 const policy=JSON.parse(String(f.db.prepare("SELECT value FROM worker_state WHERE key='browser:paid-fallback'").get()?.value));expect(policy.enabled).toBe(false);expect(policy.disabledReason).toBe('scout_recovered');
 }finally{f.db.close();}});
});
