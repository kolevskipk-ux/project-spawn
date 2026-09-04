import type {Env} from "./types";

const CAMPAIGN_ID=/^[a-z0-9][a-z0-9-]{2,79}$/;
const SHA256=/^[a-f0-9]{64}$/i;

async function digest(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}

export function validateCampaignPublicationForm(form:FormData){
  const action=String(form.get("action")||""),reason=String(form.get("reason")||"").trim().slice(0,500),expectedCount=Number(form.get("expected_count"));
  if(action!=="publish_visibility"||!reason||!Number.isInteger(expectedCount)||expectedCount<1||expectedCount>1000)return {ok:false as const,error:"invalid_campaign_review"};
  return {ok:true as const,value:{reason,expectedCount}};
}

export async function publishSeedCampaign(env:Env,campaignId:string,reason:string,expectedCount:number,actor:string){
  if(!CAMPAIGN_ID.test(campaignId)||!reason||!Number.isInteger(expectedCount))return {ok:false as const,error:"invalid_campaign_review"};
  const replay=await env.SPAWN_DB.prepare("SELECT item_count,event_id FROM seed_campaign_publications WHERE campaign_id=?").bind(campaignId).first<{item_count:number;event_id:string}>();
  if(replay)return {ok:true as const,replayed:true,count:replay.item_count,eventId:replay.event_id};
  const candidates=await env.SPAWN_DB.prepare(`SELECT DISTINCT c.candidate_id,c.source_listing_key,c.source_url,c.vendor,c.product_name,c.product_family,c.print_series,c.language,c.retailer_sku,c.discovered_at
    FROM seed_candidate_evidence e JOIN monitoring_candidates c ON c.candidate_id=e.candidate_id JOIN amazon_watchlist w ON w.asin=upper(e.retailer_identifier)
    WHERE e.campaign_id=? AND e.disposition='ACCEPTED' AND c.source='codex_seed' AND c.review_eligible=1 AND c.status='PENDING' AND w.lifecycle_status='VERIFIED'
    ORDER BY c.candidate_id`).bind(campaignId).all<Record<string,unknown>>();
  const rows=candidates.results;
  if(rows.length!==expectedCount)return {ok:false as const,error:"campaign_count_changed",expected:expectedCount,actual:rows.length};
  if(rows.some(row=>!SHA256.test(String(row.candidate_id))||!SHA256.test(String(row.source_listing_key))))return {ok:false as const,error:"invalid_candidate_identity"};
  const now=new Date().toISOString(),eventId=await digest(`seed-campaign-publication\n${campaignId}`),statements:D1PreparedStatement[]=[];
  statements.push(env.SPAWN_DB.prepare("INSERT INTO seed_campaign_publications(campaign_id,item_count,disposition,reason,decided_by,decided_at,event_id) VALUES(?,?,'visibility_only',?,?,?,?)").bind(campaignId,rows.length,reason,actor,now,eventId));
  for(const row of rows){
    const id=String(row.candidate_id),listingKey=String(row.source_listing_key);
    statements.push(env.SPAWN_DB.prepare("UPDATE monitoring_candidates SET status='ACCEPTED',disposition='visibility_only',reviewed_by=?,review_reason=?,reviewed_at=?,published_at=? WHERE candidate_id=? AND status='PENDING'").bind(actor,reason,now,now,id));
    statements.push(env.SPAWN_DB.prepare("INSERT INTO listing_publication_decisions(candidate_id,decision,disposition,reason,decided_by,decided_at) VALUES(?,'PUBLISHED','visibility_only',?,?,?)").bind(id,reason,actor,now));
    statements.push(env.SPAWN_DB.prepare(`INSERT INTO inventory(listing_key,canonical_url,retailer,title,watch_category,retailer_sku,first_seen_at,last_seen_at,status,availability_state,price_mxn,language,language_evidence,last_change_type,print_series,fulfilment_region_state,retailer_country,mexico_delivery_status,import_cost_status)
      VALUES(?,?,?,?,?,?,?,?,'unknown','unknown',NULL,?,?,'baseline',?,'CROSS_BORDER_UNVERIFIED','MX','UNVERIFIED','UNKNOWN') ON CONFLICT(listing_key) DO NOTHING`)
      .bind(listingKey,row.source_url,row.vendor,row.product_name,row.product_family,row.retailer_sku,row.discovered_at,row.discovered_at,row.language,"Codex verified direct Amazon México product identity; availability and fulfilment remain subject to deterministic revalidation",row.print_series));
    statements.push(env.SPAWN_DB.prepare(`INSERT INTO inventory_revalidation_state(listing_key,lifecycle_state,due_at,next_eligible_at,updated_at)
      VALUES(?,'ACTIVE',?,?,?) ON CONFLICT(listing_key) DO NOTHING`).bind(listingKey,now,now,now));
  }
  statements.push(env.SPAWN_DB.prepare("INSERT INTO worker_state(key,value,updated_at) VALUES('listing_publication_version','1',?) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT),updated_at=excluded.updated_at").bind(now));
  const payload={schema_version:3,event_id:eventId,event_type:"CAMPAIGN_PUBLISHED",source_owner:"spawn",campaign_id:campaignId,product_count:rows.length,disposition:"visibility_only",occurred_at:now,routing_key:"pokemon-main",inventory_url:`${env.PUBLIC_BASE_URL.replace(/\/$/,"")}/inventory`};
  statements.push(env.SPAWN_DB.prepare("INSERT INTO campaign_customer_events(event_id,schema_version,event_type,campaign_id,routing_key,payload_json,occurred_at,created_at) VALUES(?,3,'CAMPAIGN_PUBLISHED',?,'pokemon-main',?,?,?)").bind(eventId,campaignId,JSON.stringify(payload),now,now));
  await env.SPAWN_DB.batch(statements);
  return {ok:true as const,replayed:false,count:rows.length,eventId};
}
