import {handleScoutHost} from './scout-diagnostics';
import type {Env} from './types';
import type {Operator} from './operations-auth';
import {mutationAllowed} from './operations-auth';
import {esc,operationsError} from './operations';
const COMMAND='scout:control:amazon',AGENT='scout:control:agent';
export const CONTROL_COOLDOWN=3600000;
export type RestartCommand={id:string;status:'queued'|'claimed'|'restarted'|'blocked'|'failed';requestedAt:string;requestedBy:string;expiresAt:string;completedAt?:string;reason?:string};
const REASONS=['restart_started','manual_pause','protected_stop','service_inactive','restart_budget_exhausted','snapshot_unavailable','restart_failed','already_processed'];
export async function readControl(env:Env,key:string){
 const row=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind(key).first<{value:string}>();
 return row?JSON.parse(row.value):null;
}
export async function queueScoutRestart(env:Env,email:string,now=new Date()){
 const command:RestartCommand={id:crypto.randomUUID(),status:'queued',requestedAt:now.toISOString(),requestedBy:email,expiresAt:new Date(now.getTime()+600000).toISOString()};
 const result=await env.SPAWN_DB.prepare('INSERT INTO worker_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE worker_state.updated_at<=?').bind(COMMAND,JSON.stringify(command),command.requestedAt,new Date(now.getTime()-CONTROL_COOLDOWN).toISOString()).run();
 return result.meta.changes===1?command:null;
}
// Server-only fixed operation: the caller cannot supply shell commands or services.
export async function scoutControlAgent(request:Request,env:Env):Promise<Response|null>{
 if(new URL(request.url).pathname==='/internal/scout-host/heartbeat')return handleScoutHost(request,env);
 if(new URL(request.url).pathname!=='/internal/scout-control')return null;
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
 if(env.SCOUT_CONTROL_ENABLED!=='true')return reply({error:'disabled'},503);
 const token=env.AMAZON_SERVER_COLLECTOR_TOKEN;
 if(!token||[env.AMAZON_COLLECTOR_TOKEN,env.AMAZON_LAPTOP_COLLECTOR_TOKEN,env.RUN_TOKEN,env.CATCH_INGEST_SECRET,env.WALMART_COLLECTOR_TOKEN,env.MERCADOLIBRE_COLLECTOR_TOKEN].includes(token)||request.headers.get('authorization')!==`Bearer ${token}`)return reply({error:'unauthorized'},401);
 const now=new Date();
 if(request.method==='GET'){
  const command:RestartCommand|null=await readControl(env,COMMAND);
  return reply({command:command?.status==='queued'&&Date.parse(command.expiresAt)>now.getTime()?{id:command.id,expiresAt:command.expiresAt}:null});
 }
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 const text=await request.text();if(text.length>2048)return reply({error:'too_large'},413);
 let body:any;try{body=JSON.parse(text);}catch{return reply({error:'invalid_json'},400);}
 if(!body||typeof body!=='object')return reply({error:'invalid_request'},400);
 if(body.action==='report'){
  if(!Number.isInteger(body.fresh)||body.fresh<0||body.fresh>16||body.total!==16||typeof body.protected!=='boolean'||typeof body.restartAvailable!=='boolean'||!['healthy','degraded','recovering','attention_required','protected','unknown'].includes(body.state))return reply({error:'invalid_report'},400);
  const report={receivedAt:now.toISOString(),fresh:body.fresh,total:body.total,protected:body.protected,restartAvailable:body.restartAvailable,state:body.state};
  await env.SPAWN_DB.prepare('INSERT INTO worker_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(AGENT,JSON.stringify(report),report.receivedAt).run();
  return reply({ok:true});
 }
 const previous:RestartCommand|null=await readControl(env,COMMAND);
 if(!previous||body.id!==previous.id)return reply({error:'request_not_found'},404);
 let next:RestartCommand;
 if(body.action==='claim'){
  if(previous.status!=='queued'||Date.parse(previous.expiresAt)<=now.getTime())return reply({error:'not_pending'},409);
  next={...previous,status:'claimed'};
 }else if(body.action==='result'){
  if(previous.status===body.status&&previous.reason===body.reason&&previous.completedAt)return reply({ok:true});
  if(previous.status!=='claimed'||!['restarted','blocked','failed'].includes(body.status)||!REASONS.includes(body.reason))return reply({error:'invalid_result'},409);
  next={...previous,status:body.status,reason:body.reason,completedAt:now.toISOString()};
 }else return reply({error:'invalid_action'},400);
 const update=await env.SPAWN_DB.prepare('UPDATE worker_state SET value=? WHERE key=? AND value=?').bind(JSON.stringify(next),COMMAND,JSON.stringify(previous)).run();
 return reply({ok:update.meta.changes===1},update.meta.changes===1?200:409);
}
export async function scoutControlPanel(env:Env,operator:Operator){
 const [command,agent,health]=await Promise.all([readControl(env,COMMAND),readControl(env,AGENT),readControl(env,'scout:health-latest')]);
 const live=agent&&Date.now()-Date.parse(agent.receivedAt)<300000;
 const cooling=command&&Date.now()-Date.parse(command.requestedAt)<CONTROL_COOLDOWN;
 const enabled=env.SCOUT_CONTROL_ENABLED==='true';
 const pending=command&&['queued','claimed'].includes(command.status)&&Date.parse(command.expiresAt)>Date.now();
 const status=command?(pending?command.status:['queued','claimed'].includes(command.status)?'Expired / outcome unconfirmed':command.status):'No restart requested';
 return `<section><h2>Scout · Amazon server</h2><p>${live?`${esc(agent.fresh)} / ${esc(agent.total)} products have fresh accepted page reads. Server: <strong>${esc(String(agent.state??'unknown').replaceAll('_',' '))}</strong>.`:'Server recovery agent has not reported recently. Its current state is unknown.'}</p><p class="ops-muted">Coverage sampled: ${esc(agent?.receivedAt??'Unavailable')} (UTC). Fleet monitor: ${esc(health&&Date.now()-Date.parse(health.at)<300000?(health.severity??'healthy'):'unknown')}.</p><p>Last restart request: <strong>${esc(status)}</strong>${command?` · ${esc(command.requestedAt)} UTC · ${esc(command.reason??'')}`:''}.</p>${operator.role==='owner'&&enabled?`<form method="post" action="/ops/scout/restart"><input type="hidden" name="action" value="restart-amazon"><button class="ops-primary"${!live||agent.protected||agent.restartAvailable!==true||cooling?' disabled':''}>Restart Scout</button></form><p class="ops-muted">Restarts the Amazon browser within about two minutes. Preserves monitoring settings and baselines. Pauses and challenge cooldowns remain in force. Maximum one restart per hour and two per day, shared with automatic recovery. ${cooling?'A restart was requested in the last hour.':''}</p>`:`<p class="ops-muted">${!enabled?'Remote restart is not enabled.':'Only the owner can restart Scout.'}</p>`}<p><a href="/ops/health">Refresh status</a></p></section>`;
}
export async function scoutRestartOperations(request:Request,env:Env,operator:Operator){
 if(request.method!=='POST')return operationsError('Use the restart button in System health.',405,operator,env);
 if(operator.role!=='owner'||!mutationAllowed(request,operator))return operationsError('Only the owner can restart Scout using the form on this website.',403,operator,env);
 if(env.SCOUT_CONTROL_ENABLED!=='true')return operationsError('Remote restart is not enabled.',503,operator,env);
 const form=await request.formData();if(form.get('action')!=='restart-amazon')return operationsError('Invalid restart action.',400,operator,env);
 const agent=await readControl(env,AGENT);
 if(!agent||Date.now()-Date.parse(agent.receivedAt)>300000)return operationsError('Scout’s recovery agent is offline or has not reported recently. No restart was queued.',409,operator,env);
 if(agent.protected)return operationsError('Scout is paused or in a protected stop. A restart cannot bypass this state.',409,operator,env);
 if(agent.restartAvailable!==true)return operationsError('Scout’s restart limit is reached. Wait for the recovery budget to reset.',429,operator,env);
 if(!await queueScoutRestart(env,operator.email))return operationsError('A restart was requested in the last hour. Check its status before retrying.',429,operator,env);
 return new Response(null,{status:303,headers:{location:'/ops/health','cache-control':'no-store'}});
}
