import {scoutCatalog} from './scout-target-catalog';
import type {Env} from './types';
export const HOST_KEY='scout:host:latest';
export const HOST_MAX_AGE_MS=180000;
export type ServiceState='active'|'inactive'|'failed'|'unknown';
export interface HostReport {
 targetCount?:number;catalogVersion?:string|null;schemaVersion:1;observedAt:string;receivedAt:string;bootedAt:string|null;
 desktop:'active'|'inactive'|'unknown';amazonService:ServiceState;marketplaceService:ServiceState;
 serviceStartedAt:string|null;snapshotAt:string|null;lastAttemptAt:string|null;lastReadAt:string|null;
 localFresh:number;acceptedFresh:number;runtimeErrors:number;blockedReads:number;identityErrors:number;intakeFailures:number;
 manualPaused:boolean|null;enabled:boolean|null;stopReason:string|null;
}
const dates=['bootedAt','serviceStartedAt','snapshotAt','lastAttemptAt','lastReadAt'] as const;
const counts=['localFresh','acceptedFresh','runtimeErrors','blockedReads','identityErrors','intakeFailures'] as const;
const services=['active','inactive','failed','unknown'];
export function validateHostReport(raw:unknown,now:number):Omit<HostReport,'receivedAt'>|null{
 if(!raw||typeof raw!=='object')return null;const b=raw as Record<string,unknown>;
 if(b.schemaVersion!==1||typeof b.observedAt!=='string'||!Number.isFinite(Date.parse(b.observedAt))||Math.abs(now-Date.parse(b.observedAt))>120000)return null;
 if(typeof b.desktop!=='string'||typeof b.amazonService!=='string'||typeof b.marketplaceService!=='string'||!['active','inactive','unknown'].includes(b.desktop)||!services.includes(b.amazonService)||!services.includes(b.marketplaceService))return null;
 for(const k of dates)if(b[k]!==null&&(typeof b[k]!=='string'||!Number.isFinite(Date.parse(b[k] as string))||Date.parse(b[k] as string)>now+60000))return null;
 const total=b.targetCount===undefined?16:b.targetCount;
 if(!Number.isInteger(total)||Number(total)<0||Number(total)>20||!(b.catalogVersion===undefined||b.catalogVersion===null||typeof b.catalogVersion==='string'&&/^[a-f0-9]{64}$/.test(b.catalogVersion)))return null;
 for(const k of counts)if(!Number.isInteger(b[k])||Number(b[k])<0||Number(b[k])>(k.endsWith('Fresh')?Number(total):1000))return null;
 if(Number(b.acceptedFresh)>Number(b.localFresh))return null;
 if(![null,true,false].includes(b.manualPaused as any)||![null,true,false].includes(b.enabled as any))return null;
 if(![null,'CHALLENGE','READ_FAILURES','RUN_FAILED','RELOADED','OTHER'].includes(b.stopReason as any))return null;
 // Reconstruct the payload: unknown fields (including credentials/HTML) are never stored.
 const clean=Object.fromEntries(['schemaVersion','observedAt','desktop','amazonService','marketplaceService',...dates,...counts,'manualPaused','enabled','stopReason'].map(k=>[k,b[k]]));
 clean.targetCount=total;clean.catalogVersion=b.catalogVersion??null;
 for(const k of ['observedAt',...dates])if(clean[k]!==null)clean[k]=new Date(clean[k] as string).toISOString();
 return clean as unknown as Omit<HostReport,'receivedAt'>;
}
export function serverCollectorAuthorized(request:Request,env:Env){
 const token=env.AMAZON_SERVER_COLLECTOR_TOKEN;
 return !!token&&!['AMAZON_COLLECTOR_TOKEN','AMAZON_LAPTOP_COLLECTOR_TOKEN','RUN_TOKEN','CATCH_INGEST_SECRET','WALMART_COLLECTOR_TOKEN','MERCADOLIBRE_COLLECTOR_TOKEN'].some(k=>(env as any)[k]===token)&&request.headers.get('authorization')===`Bearer ${token}`;
}
export async function handleScoutHost(request:Request,env:Env,now=new Date()):Promise<Response>{
 const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
 if(!serverCollectorAuthorized(request,env))return reply({error:'unauthorized'},401);
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(env.SCOUT_DIAGNOSTICS_ENABLED!=='true')return reply({error:'disabled'},503);
 const text=await request.text();if(text.length>4096)return reply({error:'too_large'},413);
 let body:unknown;try{body=JSON.parse(text);}catch{return reply({error:'invalid_json'},400);}
 const report=validateHostReport(body,now.getTime());if(!report)return reply({error:'invalid_report'},400);
 const saved={...report,receivedAt:now.toISOString()};
 const result=await env.SPAWN_DB.prepare("INSERT INTO worker_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE json_extract(worker_state.value,'$.observedAt')<json_extract(excluded.value,'$.observedAt')")
  .bind(HOST_KEY,JSON.stringify(saved),saved.receivedAt).run();
 return reply({ok:result.meta.changes===1},result.meta.changes===1?200:409);
}
export function recent(value:unknown,now:number,maxAge=300000){
 if(typeof value!=='string')return false;const age=now-Date.parse(value);return Number.isFinite(age)&&age>=0&&age<=maxAge;
}
interface Beat {receivedAt?:string;stopReason?:string|null;manualPaused?:boolean;}
interface Agent {receivedAt?:string;fresh?:number;total?:number;}
interface Notice {at?:string;status?:string;delivered?:boolean;httpStatus?:number|null;}
export function diagnoseScout(host:HostReport|null,beat:Beat|null,agent:Agent|null,notice:Notice|null,now=Date.now(),expected?:{total:number;version:string|null}){
 const total=host?.targetCount??16;
 const evidence:Array<{label:string;at:string|null;detail:string}>=[];
 const result=(code:string,title:string,confidence:'observed'|'likely'|'uncertain',explanation:string,nextStep:string)=>({code,title,confidence,explanation,nextStep,evidence});
 const add=(label:string,at:unknown,detail:string)=>evidence.push({label,at:typeof at==='string'?at:null,detail});
 add('Server reporter',host?.receivedAt,host?`Observed ${host.observedAt}; desktop ${host.desktop}; Amazon service ${host.amazonService}; marketplace service ${host.marketplaceService}`:'No host report received');
 add('Scout heartbeat',beat?.receivedAt,beat?`Stop reason: ${beat.stopReason??'none'}; manual pause: ${beat.manualPaused===true?'yes':'no'}`:'No extension heartbeat received');
 add('Recovery agent',agent?.receivedAt,agent?`${agent.fresh??'Unknown'} /  fresh accepted reads at its last sample`:'No recovery-agent report received');
 add('Ops notification receipt',notice?.at,notice?`${notice.status??'unknown'}${notice.httpStatus?` (HTTP ${notice.httpStatus})`:''}; this is Ops delivery, not customer alert delivery`:'No retained Ops notification attempt; customer alert delivery is not assessed');
 if(!host||!recent(host.receivedAt,now,HOST_MAX_AGE_MS)||!recent(host.observedAt,now,HOST_MAX_AGE_MS)){
  if(recent(beat?.receivedAt,now)||recent(agent?.receivedAt,now))return result('host_report_missing','Independent server heartbeat missing','uncertain','Other Scout signals are still arriving, so the server has recently been reachable. The host reporter or its reporting path may be failing.','Check the host reporter timer and its endpoint; do not infer a server power outage.');
  return result('server_unreachable','Server or reporting path unavailable','uncertain','No recent independent host report or Scout signal. Power loss, network trouble, a stopped reporter, and endpoint problems cannot be distinguished remotely from this evidence.','Check server power/network and the host reporter. Consider the separately approved cloud fallback policy.');
 }
 add('Server boot',host.bootedAt,'Boot time reported by the operating system');
 add('Local coverage snapshot',host.snapshotAt,`${host.localFresh}/${total} readable locally; ${host.acceptedFresh}/${total} with accepted intake receipts`);
 add('Latest attempt',host.lastAttemptAt,`${host.runtimeErrors} page runtime errors; ${host.blockedReads} blocked reads; ${host.identityErrors} identity errors; ${host.intakeFailures} intake failures in the last 15 minutes`);
 add('Latest successful local read',host.lastReadAt,'Readability does not certify stock or seller eligibility');
 const snapshotFresh=recent(host.snapshotAt,now);
 if(expected&&(total!==expected.total||(host.catalogVersion??null)!==expected.version))return result('catalog_sync_pending','Collector catalog update pending','observed','The host reports '+total+' targets; the current approved catalog has '+expected.total+'. The catalog versions differ or the enrollment count is out of date.','Wait for bounded catalog refresh or inspect the sync error. Old coverage does not establish coverage of new products.');
 if(total===0)return result('catalog_empty','No valid collector targets loaded','uncertain','The collector catalog is empty or invalid.','Inspect the catalog sync and approved scope; do not infer healthy coverage from zero targets.');
 if(host.desktop==='inactive'&&host.amazonService!=='active')return result('desktop_login_required','Desktop login required','observed','The server is reporting, but no active graphical desktop session exists and the Amazon collector is not reported running.','Sign in to the Linux desktop. The restart button cannot create an authenticated desktop session.');
 if(host.amazonService==='failed')return result('collector_service_failed','Amazon collector service failed','observed','The host is reachable and systemd reports a failed collector service. This does not by itself identify the process failure.','Inspect the collector service journal; preserve profile, pauses and challenge state.');
 if(host.amazonService==='inactive')return result('collector_stopped','Amazon collector service stopped','observed','The host is reachable and the collector service is inactive. The report cannot distinguish an intentional service stop from another cause.','Check the operator decision and service journal before starting it.');
 if(snapshotFresh&&(host.manualPaused===true||host.enabled===false))return result('monitoring_paused','Monitoring paused or disabled','observed','The current collector export reports monitoring paused or disabled.','Respect the pause; resume only through the authorized monitoring controls.');
 if(snapshotFresh&&(host.stopReason==='CHALLENGE'||host.blockedReads>0&&host.acceptedFresh<total))return result('retailer_access_blocked','Retailer access challenge reported','likely','Fresh collector evidence reports a challenge or blocked read. This is different from a server outage; a challenge can also affect cloud browsers.','Inspect the challenged page and existing cooldown. Do not clear or solve account/CAPTCHA checks automatically.');
 if(host.amazonService==='unknown')return result('service_status_unknown','Collector service status uncertain','uncertain','The host reporter is connected but could not determine the collector service state.','Check the user service manager and reporter permissions.');
 if(!snapshotFresh)return result('collector_telemetry_stale','Collector telemetry stale or missing','uncertain','The collector service is running, but its export is not fresh. The extension, export process, or file access may be failing.','Compare the extension heartbeat and service journal; process liveness does not prove successful monitoring.');
 if(host.localFresh>host.acceptedFresh&&host.intakeFailures>0)return result('intake_issue','Readings are failing to reach Spawn','likely','Fresh local reads and failed intake receipts indicate a collector-to-Spawn transport, authentication, or intake problem.','Check intake response status and connectivity. Do not reset baselines or treat failed intake as sold out.');
 if(host.acceptedFresh===total)return result('healthy','Amazon page coverage healthy','observed','All configured products have fresh readable pages with accepted intake receipts. Stock and customer delivery remain separate facts.','No recovery action indicated. Review any separate notification failure shown in the evidence.');
 if(host.runtimeErrors>0)return result('browser_read_errors','Scout/browser page checks failing','likely','The host and collector are active; recent page checks failed inside the browser workflow. A specific browser fault or a page-load/network error needs the underlying logs.','Inspect page-check diagnostics. Existing bounded recovery can act when its own thresholds are met.');
 if(host.identityErrors>0)return result('identity_unconfirmed','Product page identity unconfirmed','uncertain','The collector is receiving pages but cannot confirm some product identities. Redirects, page changes, or mapping issues are possible.','Inspect affected product evidence; do not classify unknown identity as stock availability.');
 if(recent(host.serviceStartedAt,now,600000)&&recent(host.lastAttemptAt,now))return result('warming_up','Collector refreshing coverage after startup','observed','The service started recently and attempts are progressing. Some products have not yet received a fresh successful read.','Allow the normal staggered schedule to finish; watch coverage and errors.');
 return result('coverage_gap','Coverage gap; cause uncertain','uncertain','The host and collector are reachable, but the available evidence does not explain all stale product readings.','Inspect per-product cadence, latest attempts and page evidence before choosing recovery or fallback.');
}

export async function scoutDiagnosisData(env:Env,now=Date.now()){
 const get=async(key:string)=>{
  const row=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind(key).first<{value:string}>();
  try{return row?JSON.parse(row.value):null;}catch{return null;}
 };
 const [host,beat,agent,noticeRow]=await Promise.all([
  get(HOST_KEY),get('scout:heartbeat:server'),get('scout:control:agent'),
  env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key>=? AND key<? ORDER BY key DESC LIMIT 1').bind('scout:health-event:','scout:health-event;').first<{value:string}>()
 ]);
 let notice=null;try{notice=noticeRow?JSON.parse(noticeRow.value):null;}catch{}
 const catalog=await scoutCatalog(env);
 return diagnoseScout(host,beat,agent,notice,now,{total:catalog.targets.length,version:catalog.version});
}
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export async function scoutDiagnosisPanel(env:Env,now=Date.now()){
 if(env.SCOUT_DIAGNOSTICS_ENABLED!=='true')return '<section><h2>Scout diagnosis</h2><p>Independent host diagnostics are not activated. Existing coverage and restart status are shown separately.</p></section>';
 const d=await scoutDiagnosisData(env,now);
 const age=(at:string|null)=>{
  if(!at)return 'Not available';const ms=now-Date.parse(at);
  if(!Number.isFinite(ms)||ms<0)return 'Timestamp uncertain';
  return ms<60000?`${Math.floor(ms/1000)} seconds ago`:`${Math.floor(ms/60000)} minutes ago`;
 };
 return `<section><h2>Scout diagnosis · Amazon server</h2><p><strong>${escape(d.title)}</strong> · ${d.confidence==='uncertain'?'Cause uncertain':d.confidence==='likely'?'Likely cause':'Observed evidence'}</p><p>${escape(d.explanation)}</p><p>${escape(d.nextStep)}</p><div class="ops-scroll"><table class="ops-table"><thead><tr><th scope="col">Signal</th><th scope="col">Last evidence (UTC)</th><th scope="col">Age</th><th scope="col">What it reports</th></tr></thead><tbody>${d.evidence.map(e=>`<tr><th scope="row">${escape(e.label)}</th><td>${escape(e.at??'Unavailable')}</td><td>${escape(age(e.at))}</td><td>${escape(e.detail)}</td></tr>`).join('')}</tbody></table></div><p class="ops-muted">Host heartbeat expires after three minutes; collector evidence expires after five minutes. A missing report cannot identify power versus network versus reporting failure. Diagnosis does not authorize restarts, cloud acquisition or paid usage. Customer alert delivery is not assessed here.</p></section>`;
}
