import type {Env} from './types';
import {mutationAllowed,type Operator} from './operations-auth';
import {esc,operationsShell,operationsHeaders,operationsError} from './operations';
import {deliverSupport,supportKinds,type SupportTicket} from './customer-support';

export async function customerSupportOperations(request:Request,env:Env,operator:Operator):Promise<Response> {
  const db=env.CUSTOMER_DB;
  if(!db)return operationsError('Customer support is not configured.',404,operator,env);
  if(operator.role==='viewer'||!mutationAllowed(request,operator))return operationsError('Administrator access and a form opened on this website are required.',403,operator,env);
  if(request.method==='POST') {
    const form=await request.formData(),id=String(form.get('id')??'');
    if(!/^[a-f0-9-]{36}$/.test(id))return operationsError('Choose a support request.',400,operator,env);
    await deliverSupport({CUSTOMER_DB:db,CUSTOMER_SUPPORT_WEBHOOK_URL:env.CUSTOMER_SUPPORT_WEBHOOK_URL},id,operator.email);
    return new Response(null,{status:303,headers:{location:'/ops/customer-support','cache-control':'no-store'}});
  }
  if(request.method!=='GET')return operationsError('This action is not supported.',405,operator,env);
  const tickets=await db.prepare(`SELECT s.*,m.email FROM customer_support s JOIN customer_members m ON m.id=s.customer_id ORDER BY CASE WHEN delivery_status='SENT' THEN 1 ELSE 0 END,created_at DESC LIMIT 100`).all<SupportTicket & {email:string}>();
  const content=`<section><h2>SUPPORT_SPAWN requests</h2><p>Showing up to 100 requests, with undelivered requests first. Sent means Discord accepted the message; it does not mean the request is resolved.</p><p>Use the customer ID to find the account in <a href="/ops/customers">Customers</a>. A retry after an uncertain connection may duplicate a Discord message; compare request IDs.</p></section>${tickets.results.map(t=>`<section><h2>${esc(supportKinds[t.kind])}</h2><p>${esc(t.email)} · ${esc(t.created_at)}</p><p>Request: ${esc(t.id)}<br>Customer: ${esc(t.customer_id)}</p><p style="white-space:pre-wrap">${esc(t.message)}</p><p>Delivery: ${esc(t.delivery_status)} ${t.last_error?`· ${esc(t.last_error)}`:''}</p>${t.delivery_status!=='SENT'?`<form method="post" action="/ops/customer-support"><input type="hidden" name="id" value="${esc(t.id)}"><button>Retry Discord delivery</button></form>`:''}</section>`).join('')||'<section>No support requests yet.</section>'}`;
  return new Response(operationsShell('Customer support',content,operator,env,'/ops/customer-support'),{headers:operationsHeaders()});
}
