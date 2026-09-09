import type {Env} from './types';
import type {Operator} from './operations-auth';
import {esc,operationsShell,operationsHeaders,operationsError} from './operations';

const approved=`(EXISTS(SELECT 1 FROM monitoring_candidates c WHERE c.source_listing_key=i.listing_key AND c.status='ACCEPTED' AND c.published_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM amazon_watchlist w WHERE w.product_url=i.canonical_url AND w.lifecycle_status='PUBLISHED')
 OR EXISTS(SELECT 1 FROM store_monitor_targets t JOIN store_acquisitions s ON s.id=t.store_id WHERE t.id=i.listing_key AND s.status='APPROVED'))`;
type Item={listing_key:string;title:string;language:string;retailer:string;canonical_url:string;status:string;price_mxn:number|null;revision:number;removed_at:string|null;reviewed_at:string|null};
export async function approvedInventoryOperations(request:Request,env:Env,operator:Operator):Promise<Response>{
 const url=new URL(request.url);
 if(request.method==='POST'){
  if(operator.role==='viewer')return operationsError('Administrator access is required.',403,operator,env);
  const form=await request.formData(),key=String(form.get('id')??''),revision=Number(form.get('revision')),action=String(form.get('action')??'');
  if(!Number.isSafeInteger(revision)||revision<0||!['edit','review','remove','restore'].includes(action))return operationsError('Invalid inventory action.',400,operator,env);
  const item=await env.SPAWN_DB.prepare(`SELECT i.*,COALESCE(a.revision,0) revision,a.removed_at,a.reviewed_at FROM inventory i LEFT JOIN inventory_admin_reviews a ON a.listing_key=i.listing_key WHERE i.listing_key=? AND (${approved} OR a.removed_at IS NOT NULL)`).bind(key).first<Item>();
  if(!item)return operationsError('Approved inventory item not found.',404,operator,env);
  if(item.revision!==revision)return operationsError('Item changed. Reload before saving.',409,operator,env);
  const title=String(form.get('title')??item.title).trim(),language=String(form.get('language')??item.language);
  if(action==='edit'&&(!title||title.length>300||!['english','spanish','japanese','unknown'].includes(language)))return operationsError('Enter a title and supported language.',400,operator,env);
  const at=new Date().toISOString(),id=crypto.randomUUID(),removed=action==='remove'?at:action==='restore'?null:item.removed_at;
  const statements=[
   env.SPAWN_DB.prepare(`INSERT INTO inventory_admin_reviews(listing_key,revision,reviewed_at,reviewed_by,removed_at) SELECT ?,1,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM inventory_admin_reviews WHERE listing_key=?)) ON CONFLICT(listing_key) DO UPDATE SET revision=revision+1,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,removed_at=excluded.removed_at WHERE inventory_admin_reviews.revision=?`).bind(key,at,operator.email,removed,revision,key,revision),
   env.SPAWN_DB.prepare('INSERT INTO inventory_admin_actions(id,listing_key,action,actor,acted_at,revision,details_json) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(id,key,action,operator.email,at,revision+1,JSON.stringify({before:{title:item.title,language:item.language,removed_at:item.removed_at},after:{title:action==='edit'?title:item.title,language:action==='edit'?language:item.language,removed_at:removed}}))
  ];
  const gate='EXISTS(SELECT 1 FROM inventory_admin_actions WHERE id=?)';
  if(action==='remove'){
   statements.push(env.SPAWN_DB.prepare(`UPDATE customer_inventory_events SET delivery_status='SUPPRESSED',acknowledged_at=? WHERE listing_key=? AND delivery_status IN ('PENDING','FAILED') AND ${gate}`).bind(at,key,id));
   statements.push(env.SPAWN_DB.prepare(`UPDATE store_customer_events SET expired_at=? WHERE target_id=? AND delivered_at IS NULL AND expired_at IS NULL AND ${gate}`).bind(at,key,id));
  }
  if(action==='edit')statements.push(env.SPAWN_DB.prepare(`UPDATE inventory SET title=?,language=? WHERE listing_key=? AND ${gate}`).bind(title,language,key,id));
  if(action==='remove'||action==='restore')statements.push(env.SPAWN_DB.prepare(`UPDATE worker_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT),updated_at=? WHERE key='amazon_catalog_version' AND ${gate} AND EXISTS(SELECT 1 FROM amazon_watchlist WHERE product_url=? AND lifecycle_status='PUBLISHED')`).bind(at,id,item.canonical_url));
  const results=await env.SPAWN_DB.batch(statements);
  if(!results[0].meta.changes)return operationsError('Item changed. Reload before saving.',409,operator,env);
  return new Response(null,{status:303,headers:{location:'/approvals?id='+encodeURIComponent(key),'cache-control':'no-store'}});
 }
 if(request.method!=='GET')return operationsError('Unsupported method.',405,operator,env);
 const q=(url.searchParams.get('q')??'').trim().slice(0,100),removed=url.searchParams.get('view')==='removed',key=url.searchParams.get('id')??'',page=Math.max(1,Math.min(1000,Math.floor(Number(url.searchParams.get('page'))||1)));
 const rows=(await env.SPAWN_DB.prepare(`SELECT i.*,COALESCE(a.revision,0) revision,a.removed_at,a.reviewed_at FROM inventory i LEFT JOIN inventory_admin_reviews a ON a.listing_key=i.listing_key WHERE (${approved} OR a.removed_at IS NOT NULL) AND (?<>'' OR ${removed?'a.removed_at IS NOT NULL':'a.removed_at IS NULL'}) AND (?='' OR i.listing_key=?) AND (?='' OR instr(lower(i.title||' '||i.retailer),lower(?))>0) ORDER BY i.title,i.listing_key LIMIT 26 OFFSET ?`).bind(key,key,key,q,q,(page-1)*25).all<Item>()).results;
 const cards=rows.slice(0,25).map(item=>`<section><h2>${esc(item.title)}</h2><p>${esc(item.retailer)} · ${esc(item.status)} · ${item.price_mxn==null?'Price unknown':'MXN '+esc(item.price_mxn)}${item.removed_at?' · Removed':''}</p><p><a href="${esc(item.canonical_url)}" target="_blank" rel="noopener noreferrer">Review store listing</a> · Last admin review: ${esc(item.reviewed_at??'Not yet reviewed')}</p>${operator.role==='viewer'?'':`<form method="post" action="/approvals" class="ops-form"><input type="hidden" name="id" value="${esc(item.listing_key)}"><input type="hidden" name="revision" value="${item.revision}"><label>Display title<input name="title" value="${esc(item.title)}" required maxlength="300"></label><label>Language<select name="language">${[...new Set([item.language,'english','spanish','japanese','unknown'])].map(l=>`<option${l===item.language?' selected':''}>${esc(l)}</option>`).join('')}</select></label><button name="action" value="edit">Save changes</button><button name="action" value="review">Mark reviewed</button><button name="action" value="${item.removed_at?'restore':'remove'}">${item.removed_at?'Restore':'Remove'}</button></form>`}</section>`).join('');
 const next=rows.length>25?`<p><a href="/approvals?view=${removed?'removed':'approved'}&amp;q=${encodeURIComponent(q)}&amp;page=${page+1}">Next page →</a></p>`:'';
 return new Response(operationsShell('Approved inventory',`<p>Manage approved listings. Removal hides the item from customer inventory and mutes its updates; its observation history is retained.</p><p><a href="/approvals">Approved inventory</a> · <a href="/approvals?view=removed">Removed items</a> · <a href="/approvals?view=queue">Pending review</a> · <a href="/ops/stores">Store ingestion</a></p><form method="get" class="ops-form"><input type="hidden" name="view" value="${removed?'removed':'approved'}"><label>Search inventory<input name="q" value="${esc(q)}"></label><button>Search</button></form>${cards||'<p>No matching approved inventory.</p>'}${next}`,operator,env,'/approvals'),{headers:operationsHeaders()});
}
