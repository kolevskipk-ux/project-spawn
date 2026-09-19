import type {Env} from './types';
import {supportWebhook} from './customer-support';
const kinds=new Set(['TEST','ELEVATED','RECOVERED','MONITOR_UNAVAILABLE','HEALTH_FAILURE']);
export async function handleCostWatch(request:Request,env:Env,fetchFn:typeof fetch=fetch,now=new Date()):Promise<Response|null>{
 if(new URL(request.url).pathname!=='/internal/cost-watch/alert')return null;
 const json=(body:unknown,status=200)=>Response.json(body,{status});
 if(!env.COST_WATCH_TOKEN||request.headers.get('authorization')!==`Bearer ${env.COST_WATCH_TOKEN}`)return json({error:'unauthorized'},401);
 if(request.method!=='POST')return json({error:'method'},405);
 if(Number(request.headers.get('content-length')||0)>4096)return json({error:'too_large'},413);
 let body:any;try{const raw=await request.text();if(raw.length>4096)return json({error:'too_large'},413);body=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
 if(!body||typeof body.id!=='string'||!/^[-a-zA-Z0-9_:]{1,120}$/.test(body.id)||!kinds.has(body.kind)||typeof body.summary!=='string'||!body.summary.trim()||body.summary.length>1400)return json({error:'invalid_alert'},400);
 const webhook=supportWebhook(env.OPS_DISCORD_WEBHOOK_URL);if(!webhook)return json({error:'ops_route_unavailable'},503);
 const at=now.toISOString(),lease=new Date(+now+120000).toISOString();
 await env.SPAWN_DB.prepare('INSERT OR IGNORE INTO cost_watch_alerts(id,kind,summary,created_at) VALUES(?,?,?,?)').bind(body.id,body.kind,body.summary,at).run();
 const stored=await env.SPAWN_DB.prepare('SELECT kind,summary,delivered_at FROM cost_watch_alerts WHERE id=?').bind(body.id).first<{kind:string;summary:string;delivered_at:string|null}>();
 if(!stored||stored.kind!==body.kind||stored.summary!==body.summary)return json({error:'id_conflict'},409);
 if(stored.delivered_at)return json({status:'already_delivered'});
 const claimed=await env.SPAWN_DB.prepare('UPDATE cost_watch_alerts SET lease_until=? WHERE id=? AND delivered_at IS NULL AND (lease_until IS NULL OR lease_until<=?) RETURNING id').bind(lease,body.id,at).first();
 if(!claimed)return json({status:'pending'},202);
 try{
   const response=await fetchFn(webhook+'?wait=true',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json'},body:JSON.stringify({username:'Garfield Cost Watch',allowed_mentions:{parse:[]},content:`**GARFIELD COST WATCH — ${stored.kind}**\n${stored.summary}\nReference: ${body.id}`})});
   await response.body?.cancel();
   if(!response.ok)return json({error:'discord_delivery_failed'},502);
   await env.SPAWN_DB.prepare('UPDATE cost_watch_alerts SET delivered_at=?,lease_until=NULL WHERE id=? AND lease_until=?').bind(at,body.id,lease).run();
   return json({status:'delivered'});
 }catch{return json({error:'delivery_uncertain'},502);}
}
