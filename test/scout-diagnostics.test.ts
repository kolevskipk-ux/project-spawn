import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {diagnoseScout,handleScoutHost,validateHostReport,scoutDiagnosisPanel,type HostReport} from '../src/scout-diagnostics';
const now=Date.parse('2026-11-02T22:00:00Z');const at=(age=0)=>new Date(now-age).toISOString();
const host:HostReport={schemaVersion:1,observedAt:at(),receivedAt:at(),bootedAt:at(3600000),desktop:'active',amazonService:'active',marketplaceService:'active',serviceStartedAt:at(1800000),snapshotAt:at(),lastAttemptAt:at(),lastReadAt:at(),localFresh:16,acceptedFresh:16,runtimeErrors:0,blockedReads:0,identityErrors:0,intakeFailures:0,manualPaused:false,enabled:true,stopReason:null};
const diagnose=(patch:Partial<HostReport>={})=>diagnoseScout({...host,...patch},null,null,null,now);
function fixture(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE worker_state(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');const env:any={SCOUT_DIAGNOSTICS_ENABLED:'true',AMAZON_SERVER_COLLECTOR_TOKEN:'server',AMAZON_COLLECTOR_TOKEN:'desktop',SPAWN_DB:{prepare(sql:string){let args:any[]=[];return {bind(...a:any[]){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};const request=(body:any=host,token='server',method='POST')=>new Request('https://spawn.test/internal/scout-host/heartbeat',{method,headers:{authorization:'Bearer '+token},body:method==='POST'?JSON.stringify(body):undefined});return {db,env,request};}
describe('Scout incident diagnosis',()=>{
 it('identifies healthy coverage without certifying stock',()=>{expect(diagnose().code).toBe('healthy');expect(diagnose().explanation).toContain('Stock and customer delivery remain separate');});
 it('does not mistake a missing reporter for confirmed power loss',()=>{
  const missing=diagnoseScout(null,null,null,null,now);expect(missing.code).toBe('server_unreachable');expect(missing.confidence).toBe('uncertain');
  expect(diagnoseScout(null,{receivedAt:at()},null,null,now).code).toBe('host_report_missing');
  expect(diagnose({receivedAt:at(180001)}).code).toBe('server_unreachable');
  expect(diagnose({observedAt:at(180001)}).code).toBe('server_unreachable');
 });
 it('distinguishes login dependency, stopped and failed services',()=>{
  expect(diagnose({desktop:'inactive',amazonService:'inactive'}).code).toBe('desktop_login_required');
  expect(diagnose({amazonService:'inactive'}).code).toBe('collector_stopped');
  expect(diagnose({amazonService:'failed'}).code).toBe('collector_service_failed');
  expect(diagnose({amazonService:'unknown'}).code).toBe('service_status_unknown');
 });
 it('requires fresh telemetry before using pause or challenge evidence',()=>{
  expect(diagnose({manualPaused:true}).code).toBe('monitoring_paused');
  expect(diagnose({enabled:false}).code).toBe('monitoring_paused');
  expect(diagnose({stopReason:'CHALLENGE'}).code).toBe('retailer_access_blocked');
  expect(diagnose({snapshotAt:at(300001),stopReason:'CHALLENGE'}).code).toBe('collector_telemetry_stale');
  expect(diagnose({snapshotAt:at(300001),manualPaused:true}).code).toBe('collector_telemetry_stale');
 });
 it('separates browser, intake, identity and startup coverage problems',()=>{
  expect(diagnose({localFresh:16,acceptedFresh:0,intakeFailures:12}).code).toBe('intake_issue');
  expect(diagnose({localFresh:1,acceptedFresh:1,runtimeErrors:15}).code).toBe('browser_read_errors');
  expect(diagnose({localFresh:15,acceptedFresh:15,identityErrors:3}).code).toBe('identity_unconfirmed');
  expect(diagnose({localFresh:6,acceptedFresh:6,serviceStartedAt:at(60000)}).code).toBe('warming_up');
  expect(diagnose({localFresh:15,acceptedFresh:15}).code).toBe('coverage_gap');
 });
 it('does not turn a historical failed check into current coverage failure',()=>{
  expect(diagnose({runtimeErrors:1,acceptedFresh:16}).code).toBe('healthy');
  const d=diagnoseScout(host,null,null,{at:at(),status:'http_failure',httpStatus:503},now);
  expect(d.code).toBe('healthy');expect(d.evidence.find(e=>e.label==='Ops notification receipt')?.detail).toContain('HTTP 503');
 });
 it('rejects future evidence and distinguishes host reporting from desktop activity',()=>{
  expect(diagnose({receivedAt:at(-60000)}).code).toBe('server_unreachable');
  expect(diagnose({desktop:'inactive',amazonService:'active'}).code).toBe('healthy');
 });
});
describe('Independent host intake',()=>{
 it('authenticates only the server collector and requires activation',async()=>{const f=fixture();try{
  expect((await handleScoutHost(f.request(host,'desktop'),f.env,new Date(now))).status).toBe(401);
  f.env.SCOUT_CONTROL_ENABLED='false';expect((await handleScoutHost(f.request(),f.env,new Date(now))).status).toBe(200);
  f.env.SCOUT_DIAGNOSTICS_ENABLED='false';expect((await handleScoutHost(f.request(),f.env,new Date(now))).status).toBe(503);
 }finally{f.db.close();}});
 it('rejects malformed, stale and impossible payloads',()=>{
  for(const patch of [{observedAt:at(120001)},{localFresh:17},{acceptedFresh:17},{localFresh:0,acceptedFresh:16},{desktop:'greeter'},{manualPaused:'yes'},{snapshotAt:at(-60001)}])expect(validateHostReport({...host,...patch},now)).toBeNull();
 });
 it('drops unsolicited data and rejects reordered or replayed reports',async()=>{const f=fixture();try{
  expect((await handleScoutHost(f.request({...host,password:'must-not-store',html:'must-not-store'}),f.env,new Date(now))).status).toBe(200);
  const stored=String(f.db.prepare('SELECT value FROM worker_state').get()?.value);expect(stored).not.toContain('must-not-store');
  expect((await handleScoutHost(f.request(),f.env,new Date(now+1000))).status).toBe(409);
  expect((await handleScoutHost(f.request({...host,observedAt:at(1000)}),f.env,new Date(now))).status).toBe(409);
 }finally{f.db.close();}});
 it('records the host without an export, desktop or running collector',async()=>{const f=fixture();try{
  const absent={...host,desktop:'inactive',amazonService:'inactive',snapshotAt:null,lastAttemptAt:null,lastReadAt:null,localFresh:0,acceptedFresh:0,manualPaused:null,enabled:null};
  expect((await handleScoutHost(f.request(absent),f.env,new Date(now))).status).toBe(200);
  const html=await scoutDiagnosisPanel(f.env,now);expect(html).toContain('Desktop login required');expect(html).toContain('Not available');
 }finally{f.db.close();}});
 it('renders disabled diagnostics honestly rather than claiming a host outage',async()=>{const f=fixture();try{
  f.env.SCOUT_DIAGNOSTICS_ENABLED='false';expect(await scoutDiagnosisPanel(f.env,now)).toContain('not activated');
 }finally{f.db.close();}});
});

it('keeps old challenges separate from restored coverage and normalizes timestamps',()=>{
 expect(diagnose({blockedReads:2,acceptedFresh:16}).code).toBe('healthy');
 expect(diagnose({desktop:'inactive',amazonService:'unknown'}).code).toBe('desktop_login_required');
 expect(validateHostReport({...host,observedAt:'2026-11-02T16:00:00-06:00'},now)?.observedAt).toBe(at());
});
