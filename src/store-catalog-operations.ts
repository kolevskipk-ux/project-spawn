import type {Env} from './types';
import type {Operator} from './operations-auth';
import {esc,operationsError,operationsHeaders,operationsShell} from './operations';
import {auditKnownStores,decideStore,importStoreCatalog,runCatalogTick,startCatalogRun,storeSuppressed,type Store} from './store-catalog';
import {STORE_CATEGORIES,STORE_POLICY} from './store-catalog-parser';

export async function storeCatalogOperations(request:Request,env:Env,operator:Operator):Promise<Response> {
  const url=new URL(request.url),id=url.searchParams.get('id');
  if(request.method==='POST') {
    if(operator.role==='viewer')return operationsError('Administrator access is required.',403,operator,env);
    const form=await request.formData(),action=String(form.get('action')??''),storeId=String(form.get('id')??'');
    try {
      if(action==='audit_inventory')await auditKnownStores(env);
      else if(action==='inspect')await startCatalogRun(env,storeId,operator.email);
      else if(action==='continue')await runCatalogTick(env,storeId);
      else if(action==='import')await importStoreCatalog(env,storeId);
      else if(['approve','pause','reject'].includes(action)) {
        await decideStore(env,storeId,Number(form.get('revision')),action,[...STORE_CATEGORIES],STORE_POLICY.catalogHours,operator.email);
        if(action==='approve')await importStoreCatalog(env,storeId);
      } else throw new Error('Unknown store action');
    } catch(error) {return operationsError(String((error as Error).message),409,operator,env);}
    return new Response(null,{status:303,headers:{location:'/ops/stores'+(storeId?'?id='+encodeURIComponent(storeId):''),'cache-control':'no-store'}});
  }
  if(request.method!=='GET')return operationsError('Unsupported action.',405,operator,env);
  const admin=operator.role!=='viewer',automatic=env.STORE_CATALOG_SYNC_ENABLED==='true';
  const button=(action:string,label:string,storeId='')=>admin?`<form method="post"><input type="hidden" name="id" value="${esc(storeId)}"><button name="action" value="${action}">${label}</button></form>`:'';
  let content=`<p>Approve a store once to ingest current and future supported inventory. Scheduled catalog checks are <strong>${env.STORE_CATALOG_SYNC_ENABLED==='true'?'enabled':'disabled'}</strong>. Catch enrollment is <strong>${env.STORE_MONITORING_ENABLED==='true'?'enabled':'not activated'}</strong>; customer notifications are <strong>${env.STORE_NOTIFICATIONS_ENABLED==='true'?'enabled':'not activated'}</strong>.</p>`;
  if(!id) {
    const stores=(await env.SPAWN_DB.prepare(`SELECT s.*,(SELECT COUNT(*) FROM inventory i WHERE i.canonical_url LIKE s.origin||'/%') known_items,
      (SELECT COUNT(*) FROM store_catalog_items i WHERE i.store_id=s.id) found_items FROM store_acquisitions s ORDER BY s.created_at,s.id`).all<Store&{known_items:number;found_items:number}>()).results;
    content+=button('audit_inventory','Find stores in existing inventory')+'<section><h2>Store acquisition queue</h2>';
    for(const store of stores)content+=`<article><h3><a href="/ops/stores?id=${esc(store.id)}">${esc(store.retailer)}</a></h3><p>${esc(store.origin)} · ${esc(store.status)}${await storeSuppressed(env,store)?' · Suppressed':''}${store.marketplace?' · Seller-specific review required':''}</p><p>${store.known_items} existing inventory listings · ${store.found_items} catalog products found</p></article>`;
    content+=(stores.length?'':'<p>No stores audited yet. Find stores in inventory to begin.</p>')+'</section>';
  } else {
    const store=await env.SPAWN_DB.prepare('SELECT * FROM store_acquisitions WHERE id=?').bind(id).first<Store>();
    if(!store)return operationsError('Store not found.',404,operator,env);
    const [runs,items,counts,decisions,monitoring]=await Promise.all([
      env.SPAWN_DB.prepare(`SELECT r.*,(SELECT COUNT(*) FROM store_catalog_pages p WHERE p.run_id=r.id AND p.state='PENDING') pending,
        (SELECT COUNT(*) FROM store_catalog_pages p WHERE p.run_id=r.id) pages FROM store_catalog_runs r WHERE store_id=? ORDER BY started_at DESC LIMIT 10`).bind(id).all<Record<string,unknown>>(),
      env.SPAWN_DB.prepare('SELECT * FROM store_catalog_items WHERE store_id=? ORDER BY last_seen_at DESC,url LIMIT 100').bind(id).all<Record<string,unknown>>(),
      env.SPAWN_DB.prepare(`SELECT COUNT(*) total,SUM(listing_json IS NOT NULL) supported,SUM(imported_at IS NOT NULL) imported,
        SUM(listing_key IS NULL) additional FROM store_catalog_items WHERE store_id=?`).bind(id).first<Record<string,number>>(),
      env.SPAWN_DB.prepare('SELECT * FROM store_acquisition_decisions WHERE store_id=? ORDER BY decided_at DESC LIMIT 20').bind(id).all<Record<string,unknown>>(),
      env.SPAWN_DB.prepare(`SELECT COUNT(*) total, SUM(acknowledgement_at IS NOT NULL) acknowledged,
        SUM(failures>0) exceptions,SUM(next_due_at<?) overdue,MAX(last_attempt_at) last_attempt,MAX(last_observed_at) last_observed
        FROM store_monitor_targets WHERE store_id=?`).bind(new Date().toISOString(),id).first<Record<string,unknown>>()
    ]);
    const selected=JSON.parse(store.categories_json) as string[],suppressed=await storeSuppressed(env,store);
    content+=`<p><a href="/ops/stores">← All stores</a></p><section><h2>${esc(store.retailer)}</h2><p><a href="${esc(store.origin)}" target="_blank" rel="noopener noreferrer">Visit ${esc(store.origin)}</a></p><p>${esc(store.status)}${suppressed?' · SUPPRESSED':''} · Catalog refresh: every ${store.refresh_hours} hours after completion</p><p>${counts?.total??0} products found · ${counts?.additional??0} additional listings · ${counts?.supported??0} with supported identity/offer evidence · ${counts?.imported??0} linked to inventory.</p>`;
    if(store.marketplace)content+='<p>Marketplace onboarding is not yet supported. Existing seller approvals and monitored inventory remain unchanged.</p>';
    else if(!suppressed&&!['PAUSED','REJECTED'].includes(store.status)) {
      if(automatic) {
        const running=runs.results.some(run=>run.status==='RUNNING');
        content+=`<p><strong>${running?'Audit in progress':store.status==='APPROVED'?'Automatic ingestion and catalog refresh enabled':runs.results.length?'Audit results ready for review':'Queued for automatic audit'}</strong></p><p>Background work advances every ${env.STORE_CATALOG_FAST_ENABLED==='true'?'minute':'15 minutes'} during active hours. You can leave this page; no batch clicks are needed. Refresh to see the latest progress.</p>`;
        if(!running&&runs.results.length)content+=button('inspect','Recheck catalog',id);
      } else content+=button('inspect','Start catalog audit',id)+button('continue','Process next catalog batch',id)+(store.status==='APPROVED'?button('import','Import next approved batch',id):'');
    }
    content+=`</section><section><h2>Catch monitoring</h2><p>${esc(monitoring?.total??0)} enrolled · ${esc(monitoring?.acknowledged??0)} successfully observed · ${esc(monitoring?.exceptions??0)} with check failures · ${esc(monitoring?.overdue??0)} past their next check time.</p><p>Last attempt: ${esc(monitoring?.last_attempt??'Not yet')}. Last successful observation: ${esc(monitoring?.last_observed??'Not yet')}.</p><p>Cadences are scheduling targets. Quiet hours, failures and queued work can delay checks. Ascended Heroes uses the warm hunt at 30 minutes.</p></section><section><h2>Catalog coverage</h2><p>Each batch inspects up to 24 pages. Runs resume from saved progress, with a 25,000-page ceiling. Known listings are prioritized; all product URLs are considered, including sets without active hunts. “Complete” means the accessible URL queue was exhausted; it does not guarantee the retailer exposes every product or variant. Unsupported variants and missing evidence remain outside the import.</p>`;
    content+=runs.results.map(r=>`<article><strong>${esc(r.status)}</strong> · ${esc(r.started_at)}<p>${esc(r.pages)} queued pages · ${esc(r.pending)} remaining · ${esc(r.note)}</p></article>`).join('')||'<p>No catalog run yet.</p>';
    content+='</section>';
    if(admin&&!store.marketplace&&!suppressed) {
      content+=`<section><h2>Store approval</h2><p>Approve all supported sealed Pokémon and Magic sets. Catalog discovery runs every six hours. Catch checks hot items every 5 minutes, warm every 30 minutes, and regular hourly. New hot inventory is announced immediately; other new inventory goes into a daily digest.</p><form method="post"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="revision" value="${store.revision}"><button name="action" value="approve">Approve store</button> <button name="action" value="reject">Reject store</button>${store.status==='APPROVED'?'<button name="action" value="pause">Pause store</button>':''}</form><p>Approval applies to current and future matching inventory. Unclear products are flagged separately.</p></section>`;
    }
    content+='<section><h2>Latest 100 observed products</h2><p>Fulfillment and monitoring eligibility remain separate from catalog ingestion. Existing inventory values and rejection decisions are preserved.</p>'+items.results.map(item=>`<article><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3><p>${esc(item.category??'Unclassified')} · ${item.imported_at?'In inventory':item.listing_json?'Ready for scope review':'Needs evidence / outside scope'} · Last seen ${esc(item.last_seen_at)}</p><p>${esc(item.evidence_note)}</p></article>`).join('')+'</section>';
    content+='<section><h2>Decision history</h2>'+decisions.results.map(d=>`<p>${esc(d.decided_at)} · ${esc(d.actor)} · ${esc(d.action)} · ${esc(d.details_json)}</p>`).join('')+'</section>';
  }
  return new Response(operationsShell('Store acquisition',content,operator,env,'/ops/stores'),{headers:operationsHeaders()});
}
