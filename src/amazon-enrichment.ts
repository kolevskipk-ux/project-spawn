import type { Env } from "./types";
import { assessDirectListing } from "./revalidation";

interface EnrichmentRow { transition_id:string; listing_key:string; asin:string; canonical_url:string; status:string; }

export async function runAmazonCommercialEnrichment(env:Env,now=new Date(),fetchFn:typeof fetch=fetch){
  if(env.AMAZON_ENRICHMENT_ENABLED!=="true")return {enabled:false,attempted:0,results:[] as Array<Record<string,unknown>>};
  const limit=Math.max(1,Math.min(3,Number(env.AMAZON_ENRICHMENT_BATCH_SIZE)||1)),nowIso=now.toISOString(),day=nowIso.slice(0,10);
  await env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO amazon_enrichment_queue(transition_id,listing_key,asin,reason,status,requested_at,next_eligible_at)
    SELECT 'daily:'||i.listing_key||':'||?,i.listing_key,w.asin,'DAILY_REFRESH','PENDING',?,?
    FROM inventory i JOIN amazon_watchlist w ON w.asin=i.retailer_sku AND w.lifecycle_status='PUBLISHED'
    WHERE lower(i.retailer) LIKE '%amazon%' AND COALESCE(i.pricing_observed_at,'')<=?`)
    .bind(day,nowIso,nowIso,new Date(now.getTime()-24*3_600_000).toISOString()).run();
  const due=await env.SPAWN_DB.prepare(`SELECT q.transition_id,q.listing_key,q.asin,i.canonical_url,q.status FROM amazon_enrichment_queue q JOIN inventory i ON i.listing_key=q.listing_key WHERE q.status IN ('PENDING','FAILED') AND q.next_eligible_at<=? ORDER BY CASE q.reason WHEN 'BECAME_BUYABLE' THEN 0 ELSE 1 END,q.requested_at LIMIT ?`).bind(nowIso,limit).all<EnrichmentRow>();
  const results=[] as Array<Record<string,unknown>>;
  for(const row of due.results){
    await env.SPAWN_DB.prepare("UPDATE amazon_enrichment_queue SET status='RUNNING' WHERE transition_id=? AND status IN ('PENDING','FAILED')").bind(row.transition_id).run();
    try{
      const response=await fetchFn(row.canonical_url,{headers:{"user-agent":"Mozilla/5.0 (compatible; ProjectGarfield/1.0; inventory enrichment)"},signal:AbortSignal.timeout(12000)}),html=await response.text(),assessment=assessDirectListing(response.status,html),finished=new Date().toISOString();
      if(assessment.outcome==="AVAILABLE"&&assessment.priceMxn!==null){
        await env.SPAWN_DB.batch([
          env.SPAWN_DB.prepare("UPDATE inventory SET price_mxn=?,price_verification_status='VERIFIED',pricing_observed_at=? WHERE listing_key=?").bind(assessment.priceMxn,finished,row.listing_key),
          env.SPAWN_DB.prepare("UPDATE amazon_enrichment_queue SET status='COMPLETED',completed_at=?,last_error=NULL WHERE transition_id=?").bind(finished,row.transition_id)
        ]);results.push({transitionId:row.transition_id,outcome:"VERIFIED"});
      }else{
        const next=new Date(now.getTime()+6*3_600_000).toISOString();
        await env.SPAWN_DB.prepare("UPDATE amazon_enrichment_queue SET status='FAILED',next_eligible_at=?,last_error=? WHERE transition_id=?").bind(next,`commercial_evidence_${assessment.outcome.toLowerCase()}`,row.transition_id).run();results.push({transitionId:row.transition_id,outcome:assessment.outcome});
      }
    }catch{
      await env.SPAWN_DB.prepare("UPDATE amazon_enrichment_queue SET status='FAILED',next_eligible_at=?,last_error='transport_error' WHERE transition_id=?").bind(new Date(now.getTime()+6*3_600_000).toISOString(),row.transition_id).run();results.push({transitionId:row.transition_id,outcome:"ERROR"});
    }
  }
  return {enabled:true,attempted:results.length,results};
}
