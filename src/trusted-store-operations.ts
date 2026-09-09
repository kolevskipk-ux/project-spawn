import type {Env} from './types';
import type {Operator} from './operations-auth';
import {esc,operationsError,operationsHeaders,operationsShell} from './operations';
import {amazonApprovalSummary} from './amazon-approval-digest';

export async function trustedStoreOperations(request:Request,env:Env,operator:Operator):Promise<Response>{
  if(request.method==='POST'){
    if(operator.role==='viewer')return operationsError('Administrator access is required.',403,operator,env);
    const form=await request.formData(),id=String(form.get('id')??''),action=form.get('action'),now=new Date().toISOString();
    if(action==='expand_amazon'){
      const changed=await env.SPAWN_DB.prepare("UPDATE trusted_store_rules SET include_pending=1,all_sets=1,policy_updated_at=?,policy_updated_by=? WHERE id=? AND enabled=1 AND origin='https://www.amazon.com.mx' AND seller_key LIKE 'seller:%'").bind(now,operator.email,id).run();
      if(!changed.meta.changes)return operationsError('Choose an active, verified Amazon seller rule.',409,operator,env);
    }
    else if(action==='revoke')await env.SPAWN_DB.prepare('UPDATE trusted_store_rules SET enabled=0,revoked_at=?,revoked_by=? WHERE id=? AND enabled=1').bind(now,operator.email,id).run();
    else if(action==='seen')await env.SPAWN_DB.prepare('UPDATE trusted_store_attempts SET admin_seen_at=?,admin_seen_by=? WHERE id=? AND admin_seen_at IS NULL').bind(now,operator.email,id).run();
    else return operationsError('Unknown trust action.',400,operator,env);
    return new Response(null,{status:303,headers:{location:'/ops/trusted-stores','cache-control':'no-store'}});
  }
  if(request.method!=='GET')return operationsError('Unsupported action.',405,operator,env);
  const [rules,attempts]=await Promise.all([
    env.SPAWN_DB.prepare('SELECT * FROM trusted_store_rules ORDER BY created_at DESC').all<Record<string,unknown>>(),
    env.SPAWN_DB.prepare(`SELECT t.*,c.product_name,c.source_url FROM trusted_store_attempts t LEFT JOIN monitoring_candidates c ON c.candidate_id=t.candidate_id ORDER BY (t.admin_seen_at IS NULL) DESC,t.attempted_at DESC LIMIT 100`).all<Record<string,unknown>>()
  ]);
  const button=(id:unknown,action:string,label:string)=>operator.role==='viewer'?'':`<form method="post"><input type="hidden" name="id" value="${esc(id)}"><button name="action" value="${action}">${label}</button></form>`;
  const content=`<p>Automatic approval is <strong>${env.TRUSTED_STORE_AUTO_APPROVAL_ENABLED==='true'?'enabled':'disabled'}</strong>. A store rule applies to its exact website and product category; marketplace rules also require the same stable seller ID. Each listing still needs fresh product and domestic shipping evidence. Eligible Amazon products enter Catch with initial buyable alerts off. Ascended Heroes uses warm monitoring every 30 minutes; other new products use hourly monitoring.</p><p>Revocation stops future decisions; it does not remove products already published. Missing evidence stays in the manual queue. Marking an audit flag seen does not approve or undo a product.</p><section><h2>Store rules</h2>${rules.results.map(r=>`<article><h3>${esc(r.origin)} · ${esc(r.category)}</h3><p>${esc(r.seller_key)} · ${r.enabled?'Enabled':'Revoked'}</p><p>Approved by ${esc(r.created_by)} at ${esc(r.created_at)}. Source product: ${esc(r.source_candidate_id)}.</p>${r.enabled?button(r.id,'revoke','Revoke store trust'):`<p>Revoked by ${esc(r.revoked_by)} at ${esc(r.revoked_at)}.</p>`}</article>`).join('')||'<p>No store trust established yet.</p>'}</section><section><h2>Product decisions: latest 100, unseen first</h2>${attempts.results.map(t=>`<article><h3>${esc(t.product_name??t.candidate_id)}</h3><p>${esc(t.source_url)} · ${esc(t.outcome)} · ${esc(t.attempted_at)}</p><pre>${esc(t.details_json)}</pre>${t.admin_seen_at?`<p>Seen by ${esc(t.admin_seen_by)} at ${esc(t.admin_seen_at)}.</p>`:button(t.id,'seen','Mark seen')}</article>`).join('')||'<p>No automatic approval attempts yet.</p>'}</section>`;
  const summary=await amazonApprovalSummary(env);
  const automation=`<section><h2>Amazon pending approvals</h2><p>Automation: ${env.AMAZON_PENDING_AUTOMATION_ENABLED==='true'?'enabled':'not activated'}. Daily operations digest: ${env.AMAZON_APPROVAL_DIGEST_ENABLED==='true'?'enabled':'not activated'}.</p><p>${summary.enabledSellerPolicies} seller policies cover pending inventory. ${summary.pending.reduce((n,r)=>n+r.count,0)} candidates remain pending.</p>${summary.pending.map(r=>`<p>${esc(r.reason)}: ${r.count} · oldest ${esc(r.oldest)}</p>`).join('')}${rules.results.filter(r=>r.origin==='https://www.amazon.com.mx'&&r.enabled).map(r=>`<article><h3>${esc(r.seller_key)}</h3><p>${r.include_pending?'Includes pending inventory and all supported sets':'Current rule covers its selected category and future discoveries only'}</p>${!r.include_pending?button(r.id,'expand_amazon','Approve this seller for pending inventory and all sets'):''}</article>`).join('')}${summary.enabledSellerPolicies===0?'<p>First-time setup: open <a href="/approvals">listing review</a>, approve one representative Amazon product with remember-store enabled, then approve that verified seller for pending inventory here. A stable seller ID must be present in the product evidence.</p>':''}<p>Routine matching products publish automatically. Unclear products are isolated for review. Existing rejected products are preserved. Initial backlog imports are quiet; Catch observes before reporting current availability.</p></section>`;
  return new Response(operationsShell('Trusted stores',automation+content,operator,env,'/ops/trusted-stores'),{headers:operationsHeaders()});
}
