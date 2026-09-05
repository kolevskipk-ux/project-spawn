import type {Env} from './types';
import {mutationAllowed,type Operator} from './operations-auth';
import {esc,operationsShell,operationsHeaders,operationsError} from './operations';

export async function customerOperations(request:Request,env:Env,operator:Operator):Promise<Response> {
 const db=env.CUSTOMER_DB;
 if(!db)return operationsError('Customer management is not configured in this environment.',404,operator,env);
 if(operator.role==='viewer'||!mutationAllowed(request,operator))return operationsError('Administrator access and a form opened on this website are required.',403,operator,env);
 if(request.method==='POST'){
  const form=await request.formData(),id=String(form.get('id')??''),status=String(form.get('status')??''),version=String(form.get('version')??''),reason=String(form.get('reason')??'').trim();
  if(!/^[a-f0-9-]{36}$/.test(id)||!['ACTIVE','REVOKED'].includes(status)||!/^\d{1,9}$/.test(version)||!reason||reason.length>500)return operationsError('Choose a customer and enter a reason of up to 500 characters.',400,operator,env);
  // The database trigger writes the audit in the same transaction as the update.
  const result=await db.prepare('UPDATE customer_members SET status=?,version=version+1,updated_by=?,updated_at=?,change_reason=? WHERE id=? AND version=? AND status!=?').bind(status,operator.email,new Date().toISOString(),reason,id,Number(version),status).run();
  if(result.meta.changes!==1)return operationsError('This account changed since the form was opened. Refresh Customers before trying again.',409,operator,env);
  return new Response(null,{status:303,headers:{location:'/ops/customers?saved=1','cache-control':'no-store'}});
 }
 if(request.method!=='GET')return operationsError('This action is not supported.',405,operator,env);
 const url=new URL(request.url),q=(url.searchParams.get('q')??'').trim().toLowerCase().slice(0,254);
 const [members,history]=await Promise.all([
  db.prepare("SELECT id,email,status,version,created_at,updated_at FROM customer_members WHERE ?='' OR instr(lower(email),?)>0 OR instr(id,?)>0 ORDER BY created_at DESC,id LIMIT 100").bind(q,q,q).all<{id:string;email:string;status:string;version:number;created_at:string;updated_at:string|null}>(),
  db.prepare('SELECT customer_id,status,decided_by,reason,decided_at FROM customer_access_decisions ORDER BY id DESC LIMIT 50').all<Record<string,unknown>>()
 ]);
 const content=`${url.searchParams.has('saved')?'<p class="ops-alert" role="status">Customer access updated.</p>':''}<section><h2>Customer accounts</h2><p>Pause or restore dashboard access. Changes apply on the next request, including an existing session. Customers never receive staff permissions.</p><form class="ops-form" method="get"><label>Find by email or watermark ID<input name="q" value="${esc(q)}" maxlength="254"></label><button>Search</button><a href="/ops/customers">Clear</a></form><p class="ops-muted">Showing up to 100 matching accounts. Search to find an older account.</p></section>${members.results.map(m=>`<section><h2>${esc(m.email)}</h2><p>Access: <strong>${esc(m.status==='ACTIVE'?'Active':'Paused')}</strong> · Joined ${esc(m.created_at)}</p><p class="ops-muted">Customer ID: ${esc(m.id)}</p><form class="ops-form" method="post" action="/ops/customers"><input type="hidden" name="id" value="${esc(m.id)}"><input type="hidden" name="version" value="${m.version}"><input type="hidden" name="status" value="${m.status==='ACTIVE'?'REVOKED':'ACTIVE'}"><label>Reason<textarea name="reason" required maxlength="500"></textarea></label><button class="ops-primary">${m.status==='ACTIVE'?'Pause access':'Restore access'}</button></form></section>`).join('')||'<section>No matching customer accounts.</section>'}<section><h2>Latest 50 customer access decisions</h2>${history.results.length?`<div class="ops-scroll"><table class="ops-table"><thead><tr><th>When (UTC)</th><th>Customer ID</th><th>Access</th><th>Administrator</th><th>Reason</th></tr></thead><tbody>${history.results.map(h=>`<tr>${[h.decided_at,h.customer_id,h.status,h.decided_by,h.reason].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p>No customer access changes yet.</p>'}</section>`;
 return new Response(operationsShell('Customers',content,operator,env,'/ops/customers'),{headers:operationsHeaders()});
}
