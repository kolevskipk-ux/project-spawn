import type {Env} from './types';
import {ITEMS} from './amazon-browser-targets';
import {disablePaidBrowserFallback} from './paid-browser-fallback';
const HOT=new Set(['B0H77VYKSM','B0H77XNKKK','B0H78BB9TY','B0H783FY5Z']);
const COLLECTORS=['desktop','laptop','server'];
export interface Beat {receivedAt:string;manualPaused:boolean;enabled:boolean;stopReason:string|null;challengeAttempts:number;pauseUntil:string|null;}
interface Target {asin:string;name:string;observedAt:string|null;}
export interface HealthState {armedAt:string;incident:boolean;severity:string|null;notifiedSeverity:string|null;healthySamples:number;lastSampleAt:string|null;incidentStartedAt?:string|null;lastNotifiedAt?:string|null;overnightDueAt?:string|null;overnightStartedAt?:string|null;overnightRecoveredAt?:string|null;overnightMissing?:string[];}
export function scoutAlertHours(now:number){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value])),localMinute=Number(v.hour)*60+Number(v.minute);
 const overnight=localMinute>=1290||localMinute<360;
 const minutesToMorning=localMinute>=1290?1440-localMinute+420:420-localMinute;
 return {overnight,business:!overnight,localMinute,morningAt:new Date(Math.floor(now/60000)*60000+minutesToMorning*60000).toISOString()};
}
export function scoutHealthDecision(targets:Target[],beats:Beat[],state:HealthState,now:number){
 const recent=beats.filter(b=>Date.parse(b.receivedAt)>now-300000);
 const running=recent.some(b=>b.enabled&&!b.manualPaused&&!b.stopReason);
 const paused=beats.length>0&&beats.every(b=>b.manualPaused&&Date.parse(b.pauseUntil||'')>now);
 const missing=targets.filter(t=>!t.observedAt||!Number.isFinite(Date.parse(t.observedAt))||Date.parse(t.observedAt)>now||now-Date.parse(t.observedAt)> (HOT.has(t.asin)?300000:900000));
 const failure=!running?recent.find(b=>b.stopReason==='READ_FAILURES'||b.stopReason==='RUN_FAILED'||(b.stopReason==='CHALLENGE'&&b.challengeAttempts>=2)):undefined;
 const severity=paused?'paused':missing.length===targets.length&&targets.length?'offline':failure?'stopped':missing.length?'partial':null;
 const ready=now-Date.parse(state.armedAt)>=300000;
 const unhealthy=ready&&!!severity&&severity!=='paused';
 const rank=(s:string|null)=>s==='offline'?3:s==='stopped'?2:s==='partial'?1:0;
 const consecutive=!!state.lastSampleAt&&now-Date.parse(state.lastSampleAt)>0&&now-Date.parse(state.lastSampleAt)<=90000;
 const samples=!severity&&state.lastSampleAt!==new Date(now).toISOString()?(consecutive?Math.min(2,state.healthySamples+1):1):0;
 const hours=scoutAlertHours(now);
 const overnightDueAt=state.overnightDueAt||(unhealthy&&hours.overnight?hours.morningAt:null);
 const morning=!!overnightDueAt&&now>=Date.parse(overnightDueAt)&&hours.business&&hours.localMinute>=420;
 const stableRecovery=!severity&&samples>=2;
 const alert=morning||unhealthy&&hours.business&&!overnightDueAt&&(!state.notifiedSeverity||rank(severity)>rank(state.notifiedSeverity));
 const recovery=!morning&&!overnightDueAt&&hours.business&&stableRecovery&&state.incident&&!!state.notifiedSeverity;
 return {missing,failure,severity,alert,recovery,paused,healthySamples:samples,unhealthy,overnightDueAt,morning,stableRecovery};
}
async function put(env:Env,key:string,value:unknown,stamp:string){await env.SPAWN_DB.prepare('INSERT INTO worker_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,JSON.stringify(value),stamp).run();}
export async function recordScoutHeartbeat(request:Request,env:Env,collector:string,now=new Date()){
 const raw=await request.text();if(raw.length>500)return new Response('Too large',{status:413});let b:any;try{b=JSON.parse(raw);}catch{return new Response('Invalid JSON',{status:400});}
 if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.enabled!=='boolean'||typeof b.manualPaused!=='boolean'||!Number.isInteger(b.challengeAttempts)||b.challengeAttempts<0||b.challengeAttempts>100||!([null,'CHALLENGE','READ_FAILURES','RUN_FAILED','RELOADED'].includes(b.stopReason)))return new Response('Invalid heartbeat',{status:400});
 const prior=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind('scout:heartbeat:'+collector).first<string>('value');
 const old=prior?JSON.parse(prior) as Beat:null;
 // A pause expires two hours after the explicit transition; polling never extends it.
 const pauseUntil=b.manualPaused?(old?.manualPaused?old.pauseUntil:new Date(now.getTime()+7200000).toISOString()):null;
 const beat:Beat={receivedAt:now.toISOString(),enabled:b.enabled,manualPaused:b.manualPaused,stopReason:b.stopReason,challengeAttempts:b.challengeAttempts,pauseUntil};
 await put(env,'scout:heartbeat:'+collector,beat,now.toISOString());return Response.json({ok:true,pauseUntil});
}
export async function monitorScoutHealth(env:Env,now=new Date(),fetchFn:typeof fetch=fetch){
 if(env.SCOUT_HEALTH_ALERTS_ENABLED!=='true')return;
 const stamp=now.toISOString(),owner=crypto.randomUUID();
 const lock=await env.SPAWN_DB.prepare("INSERT INTO scan_locks(name,owner,acquired_at,expires_at) VALUES('scout_health',?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,acquired_at=excluded.acquired_at,expires_at=excluded.expires_at WHERE scan_locks.expires_at<=excluded.acquired_at").bind(owner,stamp,new Date(now.getTime()+120000).toISOString()).run();
 if(lock.meta.changes!==1)return;
 try{
 const key='scout:health-state';const raw=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind(key).first<string>('value');
 const state:HealthState=raw?JSON.parse(raw):{armedAt:stamp,incident:false,severity:null,notifiedSeverity:null,healthySamples:0,lastSampleAt:null};
 if(state.lastSampleAt?.slice(0,16)===stamp.slice(0,16))return;
 const beats:Beat[]=[];for(const c of COLLECTORS){const value=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind('scout:heartbeat:'+c).first<string>('value');if(value)beats.push(JSON.parse(value));}
 const targets:Target[]=[];for(const item of ITEMS){const published=await env.SPAWN_DB.prepare("SELECT asin FROM amazon_watchlist WHERE asin=? AND lifecycle_status='PUBLISHED'").bind(item.asin).first();if(!published)continue;
 const latest=await env.SPAWN_DB.prepare("SELECT observed_at FROM amazon_browser_observations WHERE asin=? AND observed_at>=? AND observed_at<=? AND collector_state IN ('available','sold_out','buying_options_shown') ORDER BY observed_at DESC,received_at DESC,id DESC LIMIT 1").bind(item.asin,new Date(now.getTime()-900000).toISOString(),stamp).first<{observed_at:string}>();targets.push({asin:item.asin,name:item.name,observedAt:latest?.observed_at||null});}
 if(!targets.length)return;
 const d=scoutHealthDecision(targets,beats,state,now.getTime());
 const next:HealthState={...state,incident:state.incident||d.unhealthy,incidentStartedAt:state.incidentStartedAt||(d.unhealthy?stamp:null),severity:d.severity,healthySamples:d.healthySamples,lastSampleAt:stamp,overnightDueAt:d.overnightDueAt};
 if(d.overnightDueAt&&!state.overnightDueAt){next.overnightStartedAt=state.incidentStartedAt||stamp;next.overnightMissing=d.missing.map(t=>t.name);next.overnightRecoveredAt=null;}
 if(d.stableRecovery&&d.overnightDueAt&&!state.overnightRecoveredAt)next.overnightRecoveredAt=stamp;
 if(d.unhealthy&&d.overnightDueAt)next.overnightRecoveredAt=null;
 if(d.stableRecovery&&!d.overnightDueAt&&!state.notifiedSeverity){next.incident=false;next.incidentStartedAt=null;}
 if(d.stableRecovery)await disablePaidBrowserFallback(env,'scout_recovered',now);
 let delivered=false;
 let deliveryStatus:string|null=null,httpStatus:number|null=null,messageId:string|null=null,channelId:string|null=null;
 if(d.alert||d.recovery){
 const eventKey='scout:health-event:'+stamp+':'+owner;
 const event={at:stamp,kind:d.morning?'overnight_summary':d.recovery?'recovery':'outage',severity:d.severity,missing:d.missing.map(t=>t.asin),incidentStartedAt:next.incidentStartedAt,overnightStartedAt:next.overnightStartedAt??null,overnightRecoveredAt:next.overnightRecoveredAt??null};
 await put(env,eventKey,{...event,status:'pending'},stamp);
 try{
 if(!env.OPS_DISCORD_WEBHOOK_URL){deliveryStatus='missing_destination';}else{
 const local=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 const content=d.morning?['🚨 **Scout overnight coverage gap**',`First detected: ${local(next.overnightStartedAt||stamp)} (Mexico City).`,next.overnightRecoveredAt?`Fresh coverage recovered at ${local(next.overnightRecoveredAt)}.`:'Coverage has not yet recovered. Check server power, internet and Scout.',...(next.overnightMissing||[]),'The gap may contain missed opportunities; no stock conclusion is possible.'].join('\n').slice(0,1900):d.recovery?'✅ **Scout coverage restored**\nAll monitored products have fresh page readings across two consecutive health checks. These readings do not independently confirm inventory or stock.':
 ['🚨 **Scout needs attention**',d.severity==='offline'?'No monitored product has a fresh page reading. Check PC power, internet and Edge; open Scout and start monitoring.':d.failure?'Scout repeatedly stopped: '+d.failure.stopReason+'. Resolve the challenged tab or read failures, then retry monitoring.':'Some product readings are stale. Open Scout’s product tabs and check the affected pages.',...d.missing.map(t=>t.name+' — '+(t.observedAt?'last successful page read '+Math.floor((now.getTime()-Date.parse(t.observedAt))/60000)+' minutes ago':'no successful page read within 15 minutes')),'Hot products: 5-minute freshness limit; others: 15 minutes.'].join('\n').slice(0,1900);
 const url=new URL(env.OPS_DISCORD_WEBHOOK_URL);if(url.protocol!=='https:'||!['discord.com','discordapp.com'].includes(url.hostname)||!url.pathname.startsWith('/api/webhooks/'))throw Error('Invalid Scout Ops destination');url.searchParams.set('wait','true');
 const linkedContent=content.slice(0,1800)+'\n\n[Open Ops dashboard / browser fallback](https://spawn.aztlan-eng.com/ops/browser-fallback)';
 const response=await fetchFn(url.toString(),{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json'},body:JSON.stringify({username:'Garfield Scout Operations',allowed_mentions:{parse:[]},content:linkedContent})});httpStatus=response.status;delivered=response.ok;deliveryStatus=delivered?'delivered':'http_failure';
 if(delivered){const receipt:any=await response.json().catch(()=>null);messageId=typeof receipt?.id==='string'?receipt.id:null;channelId=typeof receipt?.channel_id==='string'?receipt.channel_id:null;}else await response.body?.cancel();
 if(delivered){if(d.recovery||d.morning&&!!next.overnightRecoveredAt){next.incident=false;next.notifiedSeverity=null;next.incidentStartedAt=null;next.lastNotifiedAt=null;}else{next.notifiedSeverity=d.severity||state.notifiedSeverity||'offline';next.lastNotifiedAt=stamp;}if(d.morning){next.overnightDueAt=null;next.overnightStartedAt=null;next.overnightRecoveredAt=null;next.overnightMissing=[];}}
 }
 }catch{deliveryStatus='request_failure';}
 await put(env,eventKey,{...event,status:deliveryStatus,delivered,httpStatus,messageId,channelId},stamp);
 await env.SPAWN_DB.prepare("DELETE FROM worker_state WHERE key LIKE 'scout:health-event:%' AND updated_at<?").bind(new Date(now.getTime()-604800000).toISOString()).run();
 }
 await put(env,key,next,stamp);await put(env,'scout:health-latest',{at:stamp,...d,delivered,deliveryStatus,httpStatus,messageId,channelId},stamp);
 }finally{await env.SPAWN_DB.prepare("DELETE FROM scan_locks WHERE name='scout_health' AND owner=?").bind(owner).run();}
}
