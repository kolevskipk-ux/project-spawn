import type {Env} from './types';
export const PAID_BROWSER_KEY='browser:paid-fallback';
export const PAID_BROWSER_MINUTES=15;
export interface PaidBrowserPolicy {id:string;enabled:boolean;periodStart:string;maxCapMs:number;baselineMs:number;approvedAt:string;expiresAt:string;approvedBy:string;disabledAt?:string;disabledReason?:string;}
export async function paidBrowserPolicy(env:Env,now=new Date()):Promise<PaidBrowserPolicy|null>{
 const row=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind(PAID_BROWSER_KEY).first<{value:string}>();
 if(!row)return null;
 const p=JSON.parse(row.value) as PaidBrowserPolicy;
 return {...p,enabled:p.enabled&&Number.isFinite(Date.parse(p.expiresAt))&&Date.parse(p.expiresAt)>now.getTime()};
}
export async function disablePaidBrowserFallback(env:Env,reason:string,now=new Date()){
 // A conditional update avoids disabling a newer approval between read and write.
 const row=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind(PAID_BROWSER_KEY).first<{value:string}>();
 if(!row)return false;
 const policy=JSON.parse(row.value) as PaidBrowserPolicy;if(!policy.enabled)return false;
 const next={...policy,enabled:false,disabledAt:now.toISOString(),disabledReason:reason};
 const result=await env.SPAWN_DB.prepare('UPDATE worker_state SET value=?,updated_at=? WHERE key=? AND value=?').bind(JSON.stringify(next),now.toISOString(),PAID_BROWSER_KEY,row.value).run();
 return result.meta.changes===1;
}
export async function approvePaidBrowserFallback(env:Env,operator:string,usage:{msUsed:number;periodStart:string},now=new Date()){
 if(!Number.isFinite(usage.msUsed)||usage.msUsed<0||!Number.isFinite(Date.parse(usage.periodStart)))throw Error('Invalid live browser usage');
 const existing=await paidBrowserPolicy(env,now);if(existing?.enabled)throw Error('Paid fallback is already enabled');
 const p:PaidBrowserPolicy={id:crypto.randomUUID(),enabled:true,periodStart:usage.periodStart,baselineMs:usage.msUsed,maxCapMs:usage.msUsed+PAID_BROWSER_MINUTES*60000,approvedAt:now.toISOString(),expiresAt:new Date(now.getTime()+14400000).toISOString(),approvedBy:operator};
 // Do not overwrite an approval made by another operator concurrently.
 const prior=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind(PAID_BROWSER_KEY).first<{value:string}>();
 if(prior){const current=JSON.parse(prior.value) as PaidBrowserPolicy;if(current.enabled&&Date.parse(current.expiresAt)>now.getTime())throw Error('Paid fallback is already enabled');}
 const result=prior?await env.SPAWN_DB.prepare('UPDATE worker_state SET value=?,updated_at=? WHERE key=? AND value=?').bind(JSON.stringify(p),now.toISOString(),PAID_BROWSER_KEY,prior.value).run():await env.SPAWN_DB.prepare('INSERT OR IGNORE INTO worker_state(key,value,updated_at) VALUES(?,?,?)').bind(PAID_BROWSER_KEY,JSON.stringify(p),now.toISOString()).run();
 if(result.meta.changes!==1)throw Error('Browser approval changed concurrently');
 await env.SPAWN_DB.prepare('INSERT INTO worker_state(key,value,updated_at) VALUES(?,?,?)').bind('browser:paid-approval:'+p.id,JSON.stringify(p),now.toISOString()).run();
 return p;
}
export async function handlePaidBrowserPolicy(request:Request,env:Env):Promise<Response|null>{
 if(new URL(request.url).pathname!=='/internal/garfield/browser-fallback')return null;
 if(!env.CATCH_INGEST_SECRET||request.headers.get('authorization')!==`Bearer ${env.CATCH_INGEST_SECRET}`)return new Response('Unauthorized',{status:401});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const p=await paidBrowserPolicy(env);
 return Response.json(p?{enabled:p.enabled,id:p.id,periodStart:p.periodStart,maxCapMs:p.maxCapMs,expiresAt:p.expiresAt}:{enabled:false},{headers:{'cache-control':'no-store'}});
}
