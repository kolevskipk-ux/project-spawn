import type {Env} from './types';
import type {Operator} from './operations-auth';
import {mutationAllowed} from './operations-auth';
import {esc,operationsShell,operationsHeaders,operationsError} from './operations';
import {paidBrowserPolicy,approvePaidBrowserFallback,disablePaidBrowserFallback,PAID_BROWSER_MINUTES} from './paid-browser-fallback';
async function liveUsage(env:Env,fetchFn:typeof fetch){
 const response=await fetchFn('https://pokemon30th-discord-monitor.phil-kolevski.workers.dev/status.json',{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{accept:'application/json'}});
 if(!response.ok)throw Error('Catch usage unavailable');
 const payload:any=await response.json(),u=payload?.health?.browserUsage;
 if(payload?.paidBrowserFallbackSupported!==true||!u||u.paidFallback?.available===false||!Number.isFinite(u.msUsed)||u.msUsed<0||!Number.isFinite(Date.parse(u.periodStart)))throw Error('Catch paid fallback or live usage unavailable');
 return u as {msUsed:number;periodStart:string;hoursUsed:number};
}
export async function paidBrowserOperations(request:Request,env:Env,operator:Operator,fetchFn:typeof fetch=fetch):Promise<Response>{
 if(!mutationAllowed(request,operator))return operationsError('This action requires an authorized same-site form.',403,operator,env);
 if(request.method==='POST'){
  const form=await request.formData(),action=form.get('action');
  if(action==='enable'){
   if(operator.role!=='owner')return operationsError('Only the owner can approve paid browser usage.',403,operator,env);
   if(env.SCOUT_HEALTH_ALERTS_ENABLED!=='true')return operationsError('Enable Scout recovery monitoring before enabling paid fallback.',409,operator,env);
   try{await approvePaidBrowserFallback(env,operator.email,await liveUsage(env,fetchFn));}catch{return operationsError('Cannot enable paid fallback. Check Catch connectivity, compatibility and whether an approval is already active.',409,operator,env);}
  }else if(action==='disable')await disablePaidBrowserFallback(env,'operator_disabled');
  else return operationsError('Choose enable or disable.',400,operator,env);
  return new Response(null,{status:303,headers:{location:'/ops/browser-fallback?saved=1','cache-control':'no-store'}});
 }
 if(request.method!=='GET')return operationsError('Method not allowed.',405,operator,env);
 const p=await paidBrowserPolicy(env);let usage:Awaited<ReturnType<typeof liveUsage>>|null=null;
 try{usage=await liveUsage(env,fetchFn);}catch{}
 const used=p&&usage?.periodStart===p.periodStart?Math.max(0,(usage.msUsed-p.baselineMs)/60000):null;
 const status=p?.enabled?(used!==null&&used>=PAID_BROWSER_MINUTES?'Allowance exhausted':'Enabled'):'Off';
 const local=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 const content=`<section><h2>Paid browser fallback</h2><p>Status: <strong>${status}</strong>${p&&!p.enabled?` — ${esc(p.disabledReason||'Approval expired')}`:''}.</p><p>Each activation authorizes up to ${PAID_BROWSER_MINUTES} browser minutes. Additional charges may apply. The approval expires after four hours and switches off when Scout has two consecutive fresh coverage checks.</p>${p?`<p>Approved by ${esc(p.approvedBy)} at ${esc(local(p.approvedAt))}. Expires ${esc(local(p.expiresAt))} (Mexico City).</p>`:''}<p>${used===null?'Live activation usage unavailable.':`${used.toFixed(2)} of ${PAID_BROWSER_MINUTES} approved browser minutes used.`}</p>${!usage?'<p>Catch usage or paid fallback support is unavailable. Enable is unavailable until Catch can report live usage.</p>':''}${operator.role==='owner'&&!p?.enabled?`<form method="post"><input type="hidden" name="action" value="enable"><button class="ops-primary"${!usage?' disabled':''}>Enable paid fallback — ${PAID_BROWSER_MINUTES} browser minutes</button></form>`:''}${operator.role!=='viewer'&&p?.enabled?'<form method="post"><input type="hidden" name="action" value="disable"><button class="ops-primary">Turn off paid fallback</button></form>':''}<p>Fallback cannot guarantee Amazon access. Refresh this page for current usage and recovery status.</p></section>`;
 return new Response(operationsShell('Browser fallback',content,operator,env,'/ops/browser-fallback'),{headers:operationsHeaders()});
}
