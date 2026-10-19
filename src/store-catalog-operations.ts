import type {Env} from './types';
import type {Operator} from './operations-auth';
import {esc,operationsError,operationsHeaders,operationsShell} from './operations';
import {auditKnownStores,decideStore,runCatalogTick,startCatalogRun,type Store} from './store-catalog';
import {STORE_CATEGORIES,STORE_POLICY} from './store-catalog-parser';
import {reviewStoreItem,storeProductsSql,storeQueueSql,STORE_PAGE_SIZE} from './store-review';
import {queueStoreImport} from './store-import-jobs';

const notices:Record<string,string>={inspect:'Audit queued. Saved progress is shown below.',continue:'Catalog batch processed. Review the saved results below.',approve:'Store approved. Saved supported products are queued for bounded ingestion; item rejections remain excluded.',reject:'Store rejected. Further acquisition and ingestion are stopped; history is preserved.',pause:'Store paused. History is preserved.',approve_item:'Item approved for inclusion. Store approval and identity evidence still govern ingestion.',reject_item:'Item rejected. Store-wide approval will preserve this exclusion.',import:'Saved inventory import queued.',audit_inventory:'Existing inventory stores checked. Store decisions were preserved.'};
const statuses=['PENDING','APPROVED','REJECTED','PAUSED'];
const readable=(value:unknown)=>String(value??'Unknown').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const when=(value:unknown)=>{const date=new Date(String(value??''));return Number.isFinite(+date)?new Intl.DateTimeFormat('en-GB',{timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'}).format(date)+' Mexico City':'Not yet';};
export async function storeCatalogOperations(request:Request,env:Env,operator:Operator):Promise<Response>{
 const url=new URL(request.url),id=url.searchParams.get('id'),admin=operator.role!=='viewer';
 if(request.method==='POST'){
  if(!admin)return operationsError('Administrator access is required.',403,operator,env);
  const form=await request.formData(),action=String(form.get('action')??''),storeId=String(form.get('id')??'');
  let findNext:string|null=null;
  try{
   if(action==='audit_inventory')findNext=(await auditKnownStores(env,new Date(),{after:String(form.get('inventory_after')??'').slice(0,100),limit:100})).next;
   else if(action==='inspect')await startCatalogRun(env,storeId,operator.email);
   else if(action==='continue')await runCatalogTick(env,storeId);
   else if(action==='import')await queueStoreImport(env,storeId,false);
   else if(['approve_item','reject_item'].includes(action)){
    await reviewStoreItem(env,storeId,String(form.get('url')??''),Number(form.get('item_revision')),action,operator.email);
    if(action==='approve_item')await queueStoreImport(env,storeId);
   }else if(['approve','reject','pause'].includes(action)){
    await decideStore(env,storeId,Number(form.get('revision')),action,[...STORE_CATEGORIES],STORE_POLICY.catalogHours,operator.email);
    if(action==='approve')await queueStoreImport(env,storeId);
    else await env.SPAWN_DB.prepare("UPDATE store_import_jobs SET status='CANCELLED',revision=revision+1 WHERE store_id=?").bind(storeId).run();
   }else throw Error('Unknown store action');
  }catch(error){return operationsError(String((error as Error).message),409,operator,env);}
  const redirect=new URL('/ops/stores',url);if(storeId)redirect.searchParams.set('id',storeId);
  redirect.searchParams.set('notice',action);if(findNext)redirect.searchParams.set('inventory_after',findNext);
  redirect.hash=action==='inspect'||action==='continue'?'audit':'inventory';
  return new Response(null,{status:303,headers:{location:redirect.pathname+redirect.search+redirect.hash,'cache-control':'no-store'}});
 }
 if(request.method!=='GET')return operationsError('Unsupported action.',405,operator,env);
 const automatic=env.STORE_CATALOG_SYNC_ENABLED==='true',imports=env.STORE_REVIEW_IMPORT_ENABLED==='true';
 const button=(action:string,label:string,storeId:string)=>admin?`<form method="post" action="/ops/stores" class="ops-form"><input type="hidden" name="id" value="${esc(storeId)}">${action==='audit_inventory'?`<input type="hidden" name="inventory_after" value="${esc(url.searchParams.get('inventory_after')??'')}">`:''}<button name="action" value="${action}">${label}</button></form>`:'';
 let content=notices[url.searchParams.get('notice')??'']?`<p class="ops-alert" role="status">${esc(notices[url.searchParams.get('notice')!])}</p>`:'';
 content+='<p>Review a store, exclude individual products, then approve its supported inventory together. Inventory ingestion and active stock monitoring are separate.</p>';
 if(!id){
  const status=statuses.includes(url.searchParams.get('status')??'')?url.searchParams.get('status')!:'PENDING',after=(url.searchParams.get('after')??'').slice(0,80);
  const rows=(await env.SPAWN_DB.prepare(storeQueueSql).bind(status,after).all<Store>()).results;
  content+=`<nav aria-label="Store decisions">${statuses.map(s=>`<a href="/ops/stores?status=${s}"${s===status?' aria-current="page"':''}>${s==='PENDING'?'Pending approval':s==='APPROVED'?'Approved':s==='REJECTED'?'Rejected':'Paused'}</a>`).join(' · ')}</nav>`;
  content+=button('audit_inventory',url.searchParams.has('inventory_after')?'Find stores in next 100 inventory listings':'Find stores in existing inventory','')+`<section><h2>${status==='PENDING'?'Stores pending approval':esc(status.toLowerCase())+' stores'}</h2>`;
  content+=rows.slice(0,STORE_PAGE_SIZE).map(s=>`<article><h3><a href="/ops/stores?id=${esc(s.id)}">${esc(s.retailer)}</a></h3><p>${esc(s.origin)} · ${esc(s.status)}${s.marketplace?' · Seller-specific review required':''}</p><p>Last completed audit: ${esc((s as Store&{last_completed_at?:string}).last_completed_at??'Not yet')}</p></article>`).join('')||'<p>No stores in this queue.</p>';
  if(rows.length>STORE_PAGE_SIZE)content+=`<a href="/ops/stores?status=${status}&amp;after=${encodeURIComponent(rows[STORE_PAGE_SIZE-1].id)}">Next stores →</a>`;
  content+='</section>';
 }else{
  const store=await env.SPAWN_DB.prepare('SELECT * FROM store_acquisitions WHERE id=?').bind(id).first<Store>();
  if(!store)return operationsError('Store not found.',404,operator,env);
  const after=(url.searchParams.get('after')??'').slice(0,1800);
  const [products,runs,decisions,job]=await Promise.all([
   env.SPAWN_DB.prepare(storeProductsSql).bind(id,after,store.origin+'/',store.origin+'0',after,id,id,id).all<Record<string,unknown>>(),
   env.SPAWN_DB.prepare('SELECT * FROM store_catalog_runs WHERE store_id=? ORDER BY started_at DESC,id LIMIT 3').bind(id).all<Record<string,unknown>>(),
   env.SPAWN_DB.prepare('SELECT * FROM store_acquisition_decisions WHERE store_id=? ORDER BY decided_at DESC,id LIMIT 5').bind(id).all<Record<string,unknown>>(),
   env.SPAWN_DB.prepare('SELECT status,cursor,last_error FROM store_import_jobs WHERE store_id=?').bind(id).first<{status:string;cursor:string;last_error:string|null}>()
  ]);
  // Presentation is not authorization: avoid enumerating all retailer aliases on
  // every GET. Mutation/import paths retain the full suppression checks.
  const suppressed=!!await env.SPAWN_DB.prepare("SELECT 1 FROM vendors WHERE vendor_key=? AND status='SUPPRESSED'").bind(store.vendor_key).first();
  const actionable=admin&&!store.marketplace&&!suppressed;
  content+=`<p><a href="/ops/stores">← Stores pending approval</a></p><section><h2>${esc(store.retailer)}</h2><p><a href="${esc(store.origin)}" target="_blank" rel="noopener noreferrer">Visit store</a> · ${esc(store.status)}${suppressed?' · Suppressed':''}</p>`;
  if(store.marketplace)content+='<p>Marketplace domains need seller-specific review. Whole-store approval is unavailable. <a href="/approvals?view=queue">Open product and seller review</a>.</p>';
  if(suppressed)content+='<p>This store is suppressed. Audit, ingestion and approval are blocked.</p>';
  if(actionable){
   content+=`<h3>Store decision</h3><p>Approve current and future supported sealed Pokémon and Magic inventory, preserving rejected items and existing review restrictions. Saved imports run in chunks of at most 40 products. Missing identity or delivery evidence is not approved by this action.</p><form method="post" action="/ops/stores" class="ops-form"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="revision" value="${store.revision}"><button name="action" value="approve">Approve store</button><button name="action" value="reject">Reject store</button>${store.status==='APPROVED'?'<button name="action" value="pause">Pause store</button>':''}</form>`;
  }
  content+=`<p>Background imports: <strong>${imports?'enabled':'paused'}</strong>. Catalog crawling: <strong>${automatic?'scheduled':'manual only'}</strong>. Store approval does not enable either setting or renew the monitoring pilot.</p>`;
  if(job)content+=`<p role="status">Saved inventory import: ${esc(job.status)}${job.last_error?' · '+esc(job.last_error):''}${job.status==='QUEUED'&&!imports?' · Waiting for background imports to be activated':''}.</p>`;
  if(actionable&&store.status==='APPROVED')content+=button('import','Queue saved inventory import',id);
  content+='</section><section id="audit"><h2>Catalog audit</h2>';
  const running=runs.results.some(r=>r.status==='RUNNING');
  if(automatic)content+=`<p>${running?'Audit in progress':runs.results.length?'Audit results ready for review':'Queued for automatic audit'}. Refresh to see saved progress.</p>`;
  else content+='<p>Automatic crawling is disabled. Start saves a resumable audit job; process one bounded batch to advance it. Opening this page never fetches retailer pages.</p>';
  if(actionable&&!['PAUSED','REJECTED'].includes(store.status)){
   if(!running)content+=button('inspect',runs.results.length?'Recheck catalog':'Start catalog audit',id);
   if(!automatic&&running)content+=button('continue','Process next catalog batch',id);
  }
  content+=runs.results.map(r=>`<article><strong>${esc(r.status)}</strong> · Started ${esc(r.started_at)}<p>${esc(r.note||'Saved audit progress; results appear in this store inventory.')}</p></article>`).join('')||'<p>No catalog run yet.</p>';
  content+='<p>Each manual batch inspects up to 24 pages under the existing 25,000-page frontier cap. Complete means the accessible queue ended, not that the retailer exposed every product.</p></section>';
  content+='<section id="inventory"><h2>Store inventory</h2><p>Up to 25 saved products per page, combining existing inventory and catalog findings. Status and prices are dated observations; failures never imply sold out. Approval does not certify live stock.</p>';
  for(const item of products.results.slice(0,STORE_PAGE_SIZE)){
   let listing:Record<string,unknown>={};try{listing=JSON.parse(String(item.listing_json||'{}'));}catch{}
   const snapshot=[
    {state:item.monitored_state,at:item.last_observed_at,price:item.monitored_price},
    {state:listing.status,at:item.catalog_seen_at,price:listing.price_mxn},
    {state:item.inventory_state,at:item.inventory_observed_at,price:item.inventory_price}
   ].filter(s=>s.state&&s.at).sort((a,b)=>(Date.parse(String(b.at))||0)-(Date.parse(String(a.at))||0))[0]??{state:'unknown',at:null,price:null};
   const label=item.decision==='REJECTED'?'Rejected':item.removed_at?'Removed from inventory':item.decision==='APPROVED'?(store.status==='APPROVED'?'Approved for inclusion':'Approved · awaiting store approval'):item.imported_at?'Ingested':item.listing_key?'Existing inventory':item.listing_json?'Awaiting store decision':'Needs identity evidence';
   content+=`<article><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3><p>${esc(label)} · ${esc(readable(item.category??'Unclassified'))}</p><p>Recorded status: <strong>${esc(readable(snapshot.state))}</strong> · ${esc(when(snapshot.at))}${snapshot.price!=null?' · MX$'+esc(snapshot.price):''}</p>${Number(item.failures)>0?`<p>Latest monitoring attempt failed; showing saved evidence. Last attempt ${esc(when(item.last_attempt_at))}.</p>`:''}<details><summary>Evidence details</summary><pre>${esc(item.evidence_note)}</pre></details>`;
   if(actionable&&!['PAUSED','REJECTED'].includes(store.status))content+=`<form method="post" action="/ops/stores" class="ops-form"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="url" value="${esc(item.url)}"><input type="hidden" name="item_revision" value="${Number(item.review_revision)||0}"><button name="action" value="approve_item"${!item.listing_json&&!item.listing_key?' disabled':''}>Approve item</button><button name="action" value="reject_item">Reject item</button></form>`;
   content+='</article>';
  }
  if(!products.results.length)content+='<p>No saved products yet. Start an audit and process a bounded batch to identify products.</p>';
  if(after)content+=`<a href="/ops/stores?id=${encodeURIComponent(id)}#inventory">First products</a> · `;
  if(products.results.length>STORE_PAGE_SIZE)content+=`<a href="/ops/stores?id=${encodeURIComponent(id)}&amp;after=${encodeURIComponent(String(products.results[STORE_PAGE_SIZE-1].url))}#inventory">Next products →</a>`;
  content+='</section><section><h2>Recent decisions</h2>'+decisions.results.map(d=>`<p>${esc(d.decided_at)} · ${esc(d.actor)} · ${esc(d.action)}</p>`).join('')+'</section>';
 }
 const styles='<style>.ops-content{min-width:0;overflow-wrap:anywhere}.ops-content article{padding:.8rem 0;border-bottom:1px solid var(--line)}.ops-content .ops-form{margin:.8rem 0}.ops-content button{border:1px solid var(--line);border-radius:.4rem;background:#222a36;color:var(--text);cursor:pointer}.ops-content button[value="approve"],.ops-content button[value="approve_item"]{background:var(--accent);color:#17200d;font-weight:700}.ops-content button[value="reject"],.ops-content button[value="reject_item"]{border-color:#a36363}.ops-content button:disabled{opacity:.45;cursor:not-allowed}.ops-content nav a{display:inline-block;padding:.6rem}.ops-content nav a[aria-current]{background:#25301e;border-radius:.4rem}.ops-content details{margin:.65rem 0}.ops-content pre{font-size:.8rem}.ops-content h3{margin-bottom:.5rem}</style>';
 return new Response(operationsShell('Stores',content,operator,env,'/ops/stores',styles),{headers:operationsHeaders()});
}
