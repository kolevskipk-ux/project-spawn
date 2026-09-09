import type {Env,Listing} from './types';
import {storeDigest} from './store-catalog';
import {storeSuppressionSql} from './store-visibility-query';

export function storeRoute(category:string){return category==='ascended_heroes'?'ascended-heroes':category==='mtg_hobbit_collector_box'?'magic-hobbit':category==='mtg_tcg'?'magic-main':category==='delta_reign'?'delta-reign':category==='30th_celebration'?'pokemon-30th':'pokemon-main';}
export function nextStoreDigest(now:Date){
  // Existing customer digest time: 09:00 Mexico City (UTC-6), daily.
  const next=new Date(now);next.setUTCHours(15,0,0,0);if(next<=now)next.setUTCDate(next.getUTCDate()+1);return next.toISOString();
}
export function targetInsert(env:Env,store:{id:string;revision:number;baseline_completed_at:string|null},listing:Listing,key:string,now:string){
  const hot=`EXISTS(SELECT 1 FROM monitoring_candidates WHERE source_listing_key=? AND status='ACCEPTED' AND disposition='five_minute')`;
  return env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO store_monitor_targets(id,store_id,url,title,category,baseline,routing_key,created_at,next_due_at,priority,cadence_minutes)
    SELECT ?,?,?,?,?,?,?,?,?,CASE WHEN ${hot} THEN 'hot' WHEN ?='ascended_heroes' THEN 'warm' ELSE 'regular' END,CASE WHEN ${hot} THEN 5 WHEN ?='ascended_heroes' THEN 30 ELSE 60 END WHERE EXISTS(SELECT 1 FROM store_acquisitions WHERE id=? AND revision=? AND status='APPROVED')
    AND EXISTS(SELECT 1 FROM inventory WHERE listing_key=?) AND NOT EXISTS(SELECT 1 FROM monitoring_candidates WHERE (source_listing_key=? OR source_url=?) AND status='REJECTED')
    AND NOT EXISTS(SELECT 1 FROM store_acquisitions s WHERE s.id=? AND ${storeSuppressionSql})`)
    .bind(key,store.id,listing.url,listing.title,listing.watch_category,Number(!store.baseline_completed_at),storeRoute(listing.watch_category),now,now,key,listing.watch_category,key,listing.watch_category,store.id,store.revision,key,key,listing.url,store.id);
}
const active=`s.status='APPROVED' AND s.marketplace=0 AND NOT ${storeSuppressionSql} AND NOT EXISTS(SELECT 1 FROM monitoring_candidates c WHERE (c.source_listing_key=t.id OR c.source_url=t.url) AND c.status='REJECTED')`;
type Target={id:string;store_id:string;url:string;title:string;category:string;priority:'hot'|'warm'|'regular';cadence_minutes:number;baseline:number;routing_key:string;state:string;price_mxn:number|null;lease_id:string|null;lease_until:string|null;new_notice_at:string|null;failures:number};
function eventStatement(env:Env,id:string,t:Target,kind:string,payload:unknown,at:string,due:string,receipt:string){return env.SPAWN_DB.prepare('INSERT OR IGNORE INTO store_customer_events(id,store_id,target_id,kind,routing_key,payload_json,created_at,due_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM store_monitor_observations WHERE receipt_id=?)').bind(id,t.store_id,t.id,kind,t.routing_key,JSON.stringify(payload),at,due,receipt);}
export async function handleStoreMonitoring(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);if(!url.pathname.startsWith('/internal/garfield/store-monitor/'))return null;
  if(!env.CATCH_INGEST_SECRET||request.headers.get('authorization')!==`Bearer ${env.CATCH_INGEST_SECRET}`)return Response.json({error:'unauthorized'},{status:401});
  if(env.STORE_MONITORING_ENABLED!=='true')return Response.json({enabled:false,targets:[],events:[]});
  if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
  const text=await request.text();if(text.length>16000)return Response.json({error:'too_large'},{status:413});
  let body:Record<string,any>;try{body=JSON.parse(text);}catch{return Response.json({error:'invalid_json'},{status:400});}
  if(!body||typeof body!=='object'||Array.isArray(body))return Response.json({error:'invalid_body'},{status:400});
  const now=new Date(),at=now.toISOString();
  if(url.pathname.endsWith('/claim')) {
    const limit=Math.min(100,Math.max(1,Math.floor(Number(body.limit)||30))),lease=crypto.randomUUID(),until=new Date(+now+180000).toISOString();
    await env.SPAWN_DB.prepare(`UPDATE store_monitor_targets SET lease_id=?,lease_until=?,last_attempt_at=? WHERE id IN (
      SELECT t.id FROM store_monitor_targets t JOIN store_acquisitions s ON s.id=t.store_id WHERE ${active} AND t.next_due_at<=? AND (t.lease_until IS NULL OR t.lease_until<?)
      ORDER BY CASE t.priority WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,t.next_due_at,t.id LIMIT ?)`)
      .bind(lease,until,at,at,at,limit).run();
    const targets=(await env.SPAWN_DB.prepare('SELECT t.*,s.origin,s.retailer FROM store_monitor_targets t JOIN store_acquisitions s ON s.id=t.store_id WHERE t.lease_id=?').bind(lease).all()).results;
    return Response.json({schema_version:1,lease_id:lease,targets});
  }
  if(url.pathname.endsWith('/observe')) {
    if(typeof body.id!=='string'||typeof body.lease_id!=='string'||!['available','sold_out','unknown','blocked','error','preorder_placeholder'].includes(body.state)||typeof body.evidence!=='string'||body.evidence.length>4000||!(body.price_mxn==null||typeof body.price_mxn==='number'&&Number.isFinite(body.price_mxn)&&body.price_mxn>0))return Response.json({error:'invalid_observation'},{status:400});
    const receipt=await storeDigest(body.id+'\n'+body.lease_id);
    if(await env.SPAWN_DB.prepare('SELECT receipt_id FROM store_monitor_observations WHERE receipt_id=?').bind(receipt).first())return Response.json({ok:true,replayed:true});
    const t=await env.SPAWN_DB.prepare(`SELECT t.* FROM store_monitor_targets t JOIN store_acquisitions s ON s.id=t.store_id WHERE t.id=? AND t.lease_id=? AND t.lease_until>=? AND ${active}`).bind(body.id,body.lease_id,at).first<Target>();
    if(!t)return Response.json({error:'stale_or_inactive_target'},{status:409});
    const good=['available','sold_out','preorder_placeholder'].includes(body.state),price=body.state==='preorder_placeholder'?null:body.price_mxn??null;
    const delay=good?t.cadence_minutes:Math.min(360,Math.max(t.cadence_minutes,5*2**Math.min(t.failures,6)));
    // The first statement revalidates the lease and approval inside the transaction.
    // Every subsequent write is conditional on this receipt being inserted.
    const statements=[env.SPAWN_DB.prepare(`INSERT INTO store_monitor_observations(receipt_id,target_id,observed_at,state,price_mxn,evidence) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM store_monitor_targets t JOIN store_acquisitions s ON s.id=t.store_id WHERE t.id=? AND t.lease_id=? AND t.lease_until>=? AND ${active})`).bind(receipt,t.id,at,body.state,price,body.evidence,t.id,body.lease_id,at),
      env.SPAWN_DB.prepare(`UPDATE store_monitor_targets SET lease_id=NULL,lease_until=NULL,next_due_at=?,last_receipt=?,state=CASE WHEN ? THEN ? ELSE state END,price_mxn=CASE WHEN ? THEN ? ELSE price_mxn END,last_observed_at=CASE WHEN ? THEN ? ELSE last_observed_at END,acknowledgement_at=CASE WHEN ? THEN COALESCE(acknowledgement_at,?) ELSE acknowledgement_at END,failures=CASE WHEN ? THEN 0 ELSE failures+1 END WHERE id=? AND lease_id=? AND EXISTS(SELECT 1 FROM store_monitor_observations WHERE receipt_id=?)`)
        .bind(new Date(+now+delay*60000).toISOString(),receipt,Number(good),body.state,Number(good),price,Number(good),at,Number(good),at,Number(good),t.id,body.lease_id,receipt)];
    if(good) {
      statements.push(env.SPAWN_DB.prepare("UPDATE inventory SET status=?,availability_state=?,price_mxn=?,last_seen_at=?,availability_observed_at=?,pricing_observed_at=?,price_verification_status=?,availability_freshness_status='LIVE_MONITORED' WHERE listing_key=? AND EXISTS(SELECT 1 FROM store_monitor_observations WHERE receipt_id=?)")
        .bind(body.state==='preorder_placeholder'?'unknown':body.state,body.state,price,at,at,price===null?null:at,price===null?'PENDING':'VERIFIED',t.id,receipt));
      const delivery=await env.SPAWN_DB.prepare('SELECT fulfilment_region_state FROM inventory WHERE listing_key=?').bind(t.id).first<{fulfilment_region_state:string}>();
      const payload={delivery_unverified:!['DOMESTIC','CROSS_BORDER_CONFIRMED'].includes(delivery?.fulfilment_region_state??''),title:t.title,url:t.url,state:body.state,price_mxn:price,priority:t.priority,observed_at:at};
      if(!t.baseline&&!t.new_notice_at){statements.push(eventStatement(env,await storeDigest('new:'+t.id),t,'NEW_INVENTORY',payload,at,t.priority==='hot'?at:nextStoreDigest(now),receipt));statements.push(env.SPAWN_DB.prepare('UPDATE store_monitor_targets SET new_notice_at=? WHERE id=? AND last_receipt=?').bind(at,t.id,receipt));}
      const restock=t.state!=='unknown'&&t.state!==body.state&&body.state==='available';
      const drop=t.price_mxn!==null&&price!==null&&body.state==='available'&&t.price_mxn-price>=100&&price<=t.price_mxn*.95;
      if(restock||drop)statements.push(eventStatement(env,await storeDigest('hunt:'+receipt),t,'HUNT_UPDATE',{...payload,change:restock?'became_available':'price_drop'},at,at,receipt));
    }
    try{await env.SPAWN_DB.batch(statements);}catch(error){if(await env.SPAWN_DB.prepare('SELECT receipt_id FROM store_monitor_observations WHERE receipt_id=?').bind(receipt).first())return Response.json({ok:true,replayed:true});throw error;}
    return await env.SPAWN_DB.prepare('SELECT receipt_id FROM store_monitor_observations WHERE receipt_id=?').bind(receipt).first()?Response.json({ok:true}):Response.json({error:'stale_or_inactive_target'},{status:409});
  }
  if(url.pathname.endsWith('/events')) {
    if(env.STORE_NOTIFICATIONS_ENABLED!=='true')return Response.json({events:[]});
    // Missed immediate alerts must not become fresh availability claims after an outage.
    await env.SPAWN_DB.prepare(`UPDATE store_customer_events SET expired_at=?,lease_id=NULL,lease_until=NULL
      WHERE delivered_at IS NULL AND expired_at IS NULL AND kind='HUNT_UPDATE' AND EXISTS(
      SELECT 1 FROM store_monitor_targets t WHERE t.id=store_customer_events.target_id AND
      (julianday(store_customer_events.created_at)+MAX(15,t.cadence_minutes*2)/1440.0<julianday(?)
       OR t.state!=json_extract(store_customer_events.payload_json,'$.state')))` ).bind(at,at).run();
    // Announce usable coverage; isolated failures must not hold an entire store hostage.
    const ready=(await env.SPAWN_DB.prepare(`SELECT s.id,s.origin,s.retailer FROM store_acquisitions s WHERE s.status='APPROVED' AND s.announced_at IS NULL AND s.baseline_completed_at IS NOT NULL AND EXISTS(SELECT 1 FROM store_monitor_targets WHERE store_id=s.id AND last_observed_at IS NOT NULL) LIMIT 20`).all<{id:string;origin:string;retailer:string}>()).results;
    for(const s of ready)await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare("INSERT OR IGNORE INTO store_customer_events(id,store_id,kind,routing_key,payload_json,created_at,due_at) VALUES(?,?,'STORE_TRACKING','pokemon-main',?,?,?)").bind(await storeDigest('store:'+s.id),s.id,JSON.stringify({title:s.retailer,state:'tracking',url:s.origin}),at,nextStoreDigest(now)),
      env.SPAWN_DB.prepare('UPDATE store_acquisitions SET announced_at=? WHERE id=?').bind(at,s.id)]);
    const lease=crypto.randomUUID();
    await env.SPAWN_DB.prepare(`UPDATE store_customer_events SET lease_id=?,lease_until=?,attempts=attempts+1 WHERE id IN (SELECT e.id FROM store_customer_events e JOIN store_acquisitions s ON s.id=e.store_id WHERE s.status='APPROVED' AND e.delivered_at IS NULL AND e.expired_at IS NULL AND e.due_at<=? AND (e.lease_until IS NULL OR e.lease_until<?) AND NOT ${storeSuppressionSql} AND (e.target_id IS NULL OR EXISTS(SELECT 1 FROM store_monitor_targets t WHERE t.id=e.target_id AND NOT EXISTS(SELECT 1 FROM monitoring_candidates c WHERE (c.source_listing_key=t.id OR c.source_url=t.url) AND c.status='REJECTED'))) ORDER BY e.due_at,e.id LIMIT 50)`)
      .bind(lease,new Date(+now+180000).toISOString(),at,at).run();
    return Response.json({lease_id:lease,events:(await env.SPAWN_DB.prepare('SELECT * FROM store_customer_events WHERE lease_id=?').bind(lease).all()).results});
  }
  if(url.pathname.endsWith('/ack-events')) {
    if(!Array.isArray(body.ids)||body.ids.length>50||body.ids.some((id:unknown)=>typeof id!=='string')||typeof body.lease_id!=='string')return Response.json({error:'invalid_ack'},{status:400});
    if(body.ids.length)await env.SPAWN_DB.batch(body.ids.map((id:string)=>env.SPAWN_DB.prepare('UPDATE store_customer_events SET delivered_at=?,lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=? AND delivered_at IS NULL').bind(at,id,body.lease_id)));
    return Response.json({ok:true});
  }
  return Response.json({error:'not_found'},{status:404});
}
