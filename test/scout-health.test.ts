import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {scoutHealthDecision,scoutDropWindow,recordScoutHeartbeat,monitorScoutHealth,type HealthState} from '../src/scout-health';
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
 it('suppresses recent notices but alerts on worsening coverage',()=>{const prior={...state,incident:true,notifiedSeverity:'partial',lastNotifiedAt:new Date(now-60000).toISOString(),lastDropWindow:scoutDropWindow(now)};expect(scoutHealthDecision([target(hot,400000),target(warm,0)],[],prior,now).alert).toBe(false);expect(scoutHealthDecision([target(hot,400000),target(warm,1000000)],[],prior,now).alert).toBe(true);});
 it('reminds during a continuing outage and escalates in each new hot window',()=>{
 const prior={...state,incident:true,notifiedSeverity:'offline',lastNotifiedAt:new Date(now-60000).toISOString(),lastDropWindow:scoutDropWindow(now)};
 expect(scoutHealthDecision([target(hot,400000)],[],prior,now).alert).toBe(false);
 expect(scoutHealthDecision([target(hot,400000)],[],prior,now+1800000).escalation).toBe(true);
 const outsideWindow=now+600000;
 expect(scoutHealthDecision([target(hot,400000)],[],{...prior,lastNotifiedAt:new Date(outsideWindow-1800000).toISOString()},outsideWindow).reminder).toBe(true);
 expect(scoutHealthDecision([target(warm,1000000)],[],prior,now+60000).escalation).toBe(false);
 expect(scoutHealthDecision([target(hot,0)],[],prior,now).alert).toBe(false);
 expect(scoutDropWindow(Date.parse('2026-10-06T08:30:00Z'))).toBeNull();
 expect(scoutDropWindow(Date.parse('2026-10-06T08:00:00Z'))).not.toBeNull();
 expect(scoutDropWindow(Date.parse('2026-10-06T12:00:00Z'))).toBeNull();
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
});
