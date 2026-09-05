export interface FeedEnv { SPAWN_DB: D1Database }
export interface CustomerListing {id:string;title:string;set_name:string;retailer:string;language:string;price_mxn:number|null;availability:string;observed_at:string}
export interface CustomerInventoryPage {rows:CustomerListing[];facets:{set_name:string;retailer:string}[]}

// This Worker has no public routes. Only the customer Worker's service binding
// can call it. Do not replace the projection with inventory.* or an admin feed.
const observed = "CASE WHEN i.availability_freshness_status='LIVE_MONITORED' AND (r.last_success_at IS NULL OR julianday(i.availability_observed_at)>=julianday(r.last_success_at)) THEN i.availability_observed_at ELSE r.last_success_at END";
const useVerifiedPrice = "i.price_verification_status='VERIFIED' AND i.pricing_observed_at IS NOT NULL AND (p.finished_at IS NULL OR julianday(i.pricing_observed_at)>=julianday(p.finished_at))";
const priceAt = `CASE WHEN ${useVerifiedPrice} THEN i.pricing_observed_at ELSE p.finished_at END`;
const price = `CASE WHEN ${useVerifiedPrice} THEN i.price_mxn ELSE p.observed_price_mxn END`;
const visible = `WITH eligible AS (
 SELECT i.listing_key id,i.title,COALESCE(i.print_series,'Unspecified') set_name,i.retailer,i.language,
 CASE WHEN (${price})>=0 AND julianday(${priceAt}) BETWEEN julianday(?)-1 AND julianday(?) THEN ${price} ELSE NULL END price_mxn,
 CASE WHEN julianday(${observed}) BETWEEN julianday(?)-1 AND julianday(?)
   AND COALESCE(r.lifecycle_state,'ACTIVE') IN ('ACTIVE','SOLD_OUT') THEN i.status ELSE 'unknown' END availability,
 COALESCE(${observed},i.last_seen_at) observed_at
 FROM inventory i LEFT JOIN inventory_revalidation_state r ON r.listing_key=i.listing_key
 LEFT JOIN inventory_revalidation_attempts p ON p.attempt_id=(SELECT a.attempt_id FROM inventory_revalidation_attempts a WHERE a.listing_key=i.listing_key AND a.outcome IN ('AVAILABLE','SOLD_OUT') AND a.http_status=200 ORDER BY a.finished_at DESC,a.attempt_id DESC LIMIT 1)
 WHERE COALESCE(r.lifecycle_state,'ACTIVE')!='ARCHIVED'
 AND (i.fulfilment_region_state='DOMESTIC' OR (i.fulfilment_region_state='CROSS_BORDER_CONFIRMED' AND julianday(i.destination_fresh_until)>julianday(?)))
 AND NOT EXISTS(SELECT 1 FROM amazon_watchlist w WHERE w.product_url=i.canonical_url AND w.lifecycle_status IN ('SUSPENDED','REJECTED'))
 AND NOT EXISTS(SELECT 1 FROM monitoring_candidates c JOIN vendors v ON v.vendor_key=c.vendor_key WHERE c.source_listing_key=i.listing_key AND v.status='SUPPRESSED')
 AND (
   EXISTS(SELECT 1 FROM monitoring_candidates c WHERE c.source_listing_key=i.listing_key AND c.status='ACCEPTED' AND c.published_at IS NOT NULL AND c.reviewed_by IS NOT NULL
     AND (SELECT d.decision FROM listing_publication_decisions d WHERE d.candidate_id=c.candidate_id ORDER BY d.id DESC LIMIT 1)='PUBLISHED')
   OR EXISTS(SELECT 1 FROM amazon_watchlist w WHERE w.product_url=i.canonical_url AND w.lifecycle_status='PUBLISHED' AND w.approved_at IS NOT NULL AND w.approved_by IS NOT NULL)
 ))`;

export async function customerInventory(env:FeedEnv,url:URL,now=new Date()):Promise<CustomerInventoryPage> {
 const stamp=now.toISOString(),q=(url.searchParams.get('q')??'').trim().slice(0,100),set=(url.searchParams.get('set')??'').slice(0,100),store=(url.searchParams.get('store')??'').slice(0,100);
 const availability=['available','sold_out','unknown'].includes(url.searchParams.get('availability')??'')?url.searchParams.get('availability')!:'';
 const page=Math.min(1000,Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)));
 // A single D1 transaction gives rows and filter options the same publication state.
 const result=await env.SPAWN_DB.batch([
  env.SPAWN_DB.prepare(`${visible} SELECT id,title,set_name,retailer,language,price_mxn,availability,observed_at FROM eligible WHERE (?='' OR instr(lower(title),lower(?))>0) AND (?='' OR set_name=?) AND (?='' OR retailer=?) AND (?='' OR availability=?) ORDER BY title,id LIMIT 25 OFFSET ?`).bind(stamp,stamp,stamp,stamp,stamp,q,q,set,set,store,store,availability,availability,(page-1)*24),
  env.SPAWN_DB.prepare(`${visible} SELECT DISTINCT set_name,retailer FROM eligible ORDER BY set_name,retailer LIMIT 1000`).bind(stamp,stamp,stamp,stamp,stamp)
 ]);
 return {rows:result[0].results as unknown as CustomerListing[],facets:result[1].results as unknown as CustomerInventoryPage['facets']};
}

export default {async fetch(request:Request,env:FeedEnv):Promise<Response>{
 const url=new URL(request.url);
 if(url.pathname!='/inventory')return new Response('Not found',{status:404});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{return Response.json(await customerInventory(env,url),{headers:{'cache-control':'no-store'}});}
 catch{return Response.json({error:'inventory_unavailable'},{status:503,headers:{'cache-control':'no-store'}});}
}};
