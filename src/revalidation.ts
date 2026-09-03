import { amazonAsin } from "./inventory";
import type { Env } from "./types";

export const REVALIDATION_PARSER_VERSION="direct-page-v1";
export type RevalidationOutcome="AVAILABLE"|"SOLD_OUT"|"UNKNOWN"|"BLOCKED"|"ERROR";

export interface RevalidationAssessment { outcome:RevalidationOutcome; priceMxn:number|null; evidence:string; }
interface DueListing { listing_key:string; canonical_url:string; retailer:string; title:string; status:string; price_mxn:number|null; routing_key:string|null; due_at:string|null; next_eligible_at:string|null; fulfilment_region_state:string; retailer_country:string|null; ship_from_country:string|null; original_price:number|null; original_currency:string|null; mexico_delivery_status:string; shipping_mxn:number|null; import_cost_status:string; destination_checked_at:string|null; destination_fresh_until:string|null; }

const fold=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
async function sha256(value:string):Promise<string>{const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}
export function assessDirectListing(status:number,html:string):RevalidationAssessment{
  const body=fold(html.slice(0,2_000_000));
  if(status===403||status===429||/(robot check|captcha|automated access|access denied|introduce los caracteres|verifica que eres humano)/i.test(body)) return {outcome:"BLOCKED",priceMxn:null,evidence:`access_blocked_http_${status}`};
  if(status<200||status>=300) return {outcome:"ERROR",priceMxn:null,evidence:`http_${status}`};
  const buyable=/(add to cart|agregar al carrito|anadir al carrito|comprar ahora|buy now|pre-?order|preventa abierta|en stock|disponible)/i.test(body);
  const soldOut=/(sold out|agotado|actualmente no disponible|currently unavailable|sin existencias|no disponible)/i.test(body);
  const productEvidence=/(pokemon|pokémon|trading card|tcg|booster|elite trainer|collection|coleccion)/i.test(body);
  const priceMatch=body.match(/(?:mx\$|mxn|\$)\s*([0-9]{1,3}(?:[, ][0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]{2,6}(?:\.[0-9]{1,2})?)/i);
  const price=priceMatch?Number(priceMatch[1].replace(/[, ]/g,"")):null;
  if(!productEvidence) return {outcome:"UNKNOWN",priceMxn:null,evidence:"product_identity_not_supported"};
  if(buyable&&!soldOut) return {outcome:"AVAILABLE",priceMxn:Number.isFinite(price)&&price!>0?price:null,evidence:"direct_buy_action"};
  if(soldOut&&!buyable) return {outcome:"SOLD_OUT",priceMxn:null,evidence:"explicit_sold_out"};
  return {outcome:"UNKNOWN",priceMxn:null,evidence:buyable&&soldOut?"conflicting_availability":"availability_not_attributable"};
}

export function nextRevalidationTime(outcome:RevalidationOutcome,now:Date,failures:number,targetHours=24):string{
  if(outcome==="AVAILABLE"||outcome==="SOLD_OUT") return new Date(now.getTime()+targetHours*3_600_000).toISOString();
  const hours=Math.min(targetHours,Math.max(2,2**Math.min(4,failures+1)));
  return new Date(now.getTime()+hours*3_600_000).toISOString();
}

export async function runInventoryRevalidation(env:Env,now=new Date(),fetchFn:typeof fetch=fetch){
  if(env.INVENTORY_REVALIDATION_ENABLED!=="true") return {enabled:false,attempted:0,results:[] as Array<Record<string,unknown>>};
  const limit=Math.max(1,Math.min(5,Number(env.INVENTORY_REVALIDATION_BATCH_SIZE)||2)), targetHours=Math.max(24,Number(env.INVENTORY_REVALIDATION_TARGET_HOURS)||24),freshnessHours=Math.max(targetHours,Number(env.INVENTORY_FRESHNESS_HOURS)||36);
  const candidates=await env.SPAWN_DB.prepare(`SELECT i.listing_key,i.canonical_url,i.retailer,i.title,i.status,i.price_mxn,c.routing_key,s.due_at,s.next_eligible_at,i.fulfilment_region_state,i.retailer_country,i.ship_from_country,i.original_price,i.original_currency,i.mexico_delivery_status,i.shipping_mxn,i.import_cost_status,i.destination_checked_at,i.destination_fresh_until
    FROM inventory i JOIN monitoring_candidates c ON c.source_listing_key=i.listing_key AND c.status='ACCEPTED'
    LEFT JOIN inventory_revalidation_state s ON s.listing_key=i.listing_key
    WHERE COALESCE(s.lifecycle_state,'ACTIVE')!='ARCHIVED' AND COALESCE(s.next_eligible_at,i.last_seen_at)<=?
    ORDER BY COALESCE(s.due_at,i.last_seen_at),i.listing_key LIMIT ?`).bind(now.toISOString(),limit*4).all<DueListing>();
  const catchRows=await env.SPAWN_DB.prepare("SELECT asin FROM amazon_watchlist WHERE lifecycle_status IN ('VERIFIED','APPROVED','PUBLISHED')").all<{asin:string}>(), catchAsins=new Set(catchRows.results.map(row=>row.asin));
  const domainRows=await env.SPAWN_DB.prepare("SELECT domain,blocked_until FROM revalidation_domain_state WHERE blocked_until>?").bind(now.toISOString()).all<{domain:string;blocked_until:string}>(), blockedDomains=new Set(domainRows.results.map(row=>row.domain));
  const selected:DueListing[]=[],domains=new Set<string>();
  for(const row of candidates.results){
    let url:URL;try{url=new URL(row.canonical_url);}catch{continue;}
    const domain=url.hostname.toLowerCase(),asin=amazonAsin(row.canonical_url);
    if(domains.has(domain)||blockedDomains.has(domain)||(asin&&catchAsins.has(asin))||(row.fulfilment_region_state==="CROSS_BORDER_CONFIRMED"&&Date.parse(row.destination_fresh_until??"")<=now.getTime()))continue;
    domains.add(domain);selected.push(row);if(selected.length>=limit)break;
  }
  const results:Array<Record<string,unknown>>=[];
  for(const row of selected){
    const started=new Date(),attemptId=crypto.randomUUID(),url=new URL(row.canonical_url),domain=url.hostname.toLowerCase();
    let httpStatus=0,responseUrl=row.canonical_url,assessment:RevalidationAssessment,error:string|null=null;
    try{
      const response=await fetchFn(row.canonical_url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; ProjectGarfield-Revalidation/1.0)",Accept:"text/html,application/xhtml+xml","Accept-Language":"es-MX,es;q=0.9,en;q=0.7"},redirect:"follow",signal:AbortSignal.timeout(8_000)});
      httpStatus=response.status;responseUrl=response.url||row.canonical_url;
      const finalUrl=new URL(responseUrl);
      assessment=finalUrl.hostname.toLowerCase()!==domain?{outcome:"UNKNOWN",priceMxn:null,evidence:"cross_domain_redirect"}:assessDirectListing(response.status,await response.text());
    }catch(caught){error=String(caught instanceof Error?caught.message:caught).slice(0,240);assessment={outcome:"ERROR",priceMxn:null,evidence:"transport_error"};}
    const finished=new Date(), prior=await env.SPAWN_DB.prepare("SELECT * FROM inventory_revalidation_state WHERE listing_key=?").bind(row.listing_key).first<Record<string,unknown>>();
    const trustworthy=assessment.outcome==="AVAILABLE"||assessment.outcome==="SOLD_OUT",failures=trustworthy?0:Number(prior?.consecutive_failures??0)+1,next=nextRevalidationTime(assessment.outcome,finished,failures,targetHours);
    const lastSuccess=typeof prior?.last_success_at==="string"?Date.parse(prior.last_success_at):NaN;
    const lifecycle=assessment.outcome==="AVAILABLE"?"ACTIVE":assessment.outcome==="SOLD_OUT"?"SOLD_OUT":assessment.outcome==="ERROR"?(Number.isFinite(lastSuccess)&&lastSuccess>finished.getTime()-freshnessHours*3_600_000?String(prior?.lifecycle_state??"ACTIVE"):"STALE"):assessment.outcome;
    const soldOutSince=assessment.outcome==="SOLD_OUT"?String(prior?.sold_out_since??finished.toISOString()):assessment.outcome==="AVAILABLE"?null:prior?.sold_out_since??null;
    const soldOutConfirmations=assessment.outcome==="SOLD_OUT"?Number(prior?.sold_out_confirmations??0)+1:assessment.outcome==="AVAILABLE"?0:Number(prior?.sold_out_confirmations??0);
    const statements:D1PreparedStatement[]=[
      env.SPAWN_DB.prepare("INSERT INTO inventory_revalidation_attempts(attempt_id,listing_key,domain,started_at,finished_at,outcome,http_status,parser_version,observed_price_mxn,evidence,error) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(attemptId,row.listing_key,domain,started.toISOString(),finished.toISOString(),assessment.outcome,httpStatus||null,REVALIDATION_PARSER_VERSION,assessment.priceMxn,assessment.evidence,error),
      env.SPAWN_DB.prepare(`INSERT INTO inventory_revalidation_state(listing_key,lifecycle_state,due_at,last_attempt_at,last_success_at,last_outcome,last_error,next_eligible_at,consecutive_failures,sold_out_since,sold_out_confirmations,evidence_revision,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(listing_key) DO UPDATE SET lifecycle_state=excluded.lifecycle_state,due_at=excluded.due_at,last_attempt_at=excluded.last_attempt_at,last_success_at=CASE WHEN ? THEN excluded.last_success_at ELSE inventory_revalidation_state.last_success_at END,last_outcome=excluded.last_outcome,last_error=excluded.last_error,next_eligible_at=excluded.next_eligible_at,consecutive_failures=excluded.consecutive_failures,sold_out_since=excluded.sold_out_since,sold_out_confirmations=excluded.sold_out_confirmations,evidence_revision=inventory_revalidation_state.evidence_revision+1,updated_at=excluded.updated_at`)
        .bind(row.listing_key,lifecycle,next,finished.toISOString(),trustworthy?finished.toISOString():null,assessment.outcome,error,next,failures,soldOutSince,soldOutConfirmations,1,finished.toISOString(),Number(trustworthy)),
      env.SPAWN_DB.prepare(`INSERT INTO revalidation_domain_state(domain,consecutive_failures,blocked_until,last_attempt_at,last_outcome,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(domain) DO UPDATE SET consecutive_failures=excluded.consecutive_failures,blocked_until=excluded.blocked_until,last_attempt_at=excluded.last_attempt_at,last_outcome=excluded.last_outcome,updated_at=excluded.updated_at`)
        .bind(domain,failures,trustworthy?null:next,finished.toISOString(),assessment.outcome,finished.toISOString())
    ];
    if(trustworthy) statements.push(env.SPAWN_DB.prepare("UPDATE inventory SET status=?,availability_state=?,price_mxn=CASE WHEN ?='AVAILABLE' AND ? IS NOT NULL THEN ? ELSE price_mxn END,last_seen_at=?,last_change_type=CASE WHEN ?='AVAILABLE' AND status='sold_out' THEN 'restock' WHEN ?='AVAILABLE' AND ? IS NOT NULL AND price_mxn IS NOT NULL AND ?<price_mxn THEN 'price_drop' ELSE 'unchanged' END WHERE listing_key=?")
      .bind(assessment.outcome==="AVAILABLE"?"available":"sold_out",assessment.outcome==="AVAILABLE"?"available":"sold_out",assessment.outcome,assessment.priceMxn,assessment.priceMxn,finished.toISOString(),assessment.outcome,assessment.outcome,assessment.priceMxn,assessment.priceMxn,row.listing_key));
    const reduction=assessment.priceMxn!=null&&row.price_mxn!=null?row.price_mxn-assessment.priceMxn:0;
    const eventType=assessment.outcome==="AVAILABLE"&&row.status==="sold_out"?"BECAME_BUYABLE":assessment.outcome==="AVAILABLE"&&assessment.priceMxn!=null&&row.price_mxn!=null&&(reduction>=100||reduction/row.price_mxn>=0.05)?"PRICE_DROP":null;
    if(eventType&&row.routing_key){
      const eventId=await sha256(`${attemptId}\n${eventType}\n${row.listing_key}`),payload={schema_version:2,event_id:eventId,event_type:eventType,source_owner:"spawn",listing_key:row.listing_key,product_name:row.title,retailer:row.retailer,direct_url:row.canonical_url,observed_state:"available",price_mxn:assessment.priceMxn,source_observation_id:attemptId,occurred_at:finished.toISOString(),routing_key:row.routing_key,evidence_fresh_until:new Date(finished.getTime()+freshnessHours*3_600_000).toISOString(),fulfilment_region_state:row.fulfilment_region_state,retailer_country:row.retailer_country,ship_from_country:row.ship_from_country,original_price:row.original_price,original_currency:row.original_currency,mexico_delivery_status:row.mexico_delivery_status,shipping_mxn:row.shipping_mxn,import_cost_status:row.import_cost_status,destination_checked_at:row.destination_checked_at,destination_fresh_until:row.destination_fresh_until};
      statements.push(env.SPAWN_DB.prepare("INSERT OR IGNORE INTO customer_inventory_events(event_id,schema_version,event_type,listing_key,source_observation_id,routing_key,payload_json,occurred_at,created_at) VALUES(?,2,?,?,?,?,?,?,?)").bind(eventId,eventType,row.listing_key,attemptId,row.routing_key,JSON.stringify(payload),finished.toISOString(),finished.toISOString()));
    }
    if(assessment.outcome==="SOLD_OUT"&&soldOutConfirmations>=2&&Date.parse(String(soldOutSince))<=finished.getTime()-30*86_400_000){
      const reviewId=await crypto.randomUUID();statements.push(env.SPAWN_DB.prepare("INSERT OR IGNORE INTO inventory_removal_reviews(review_id,listing_key,evidence_revision,status,created_at) VALUES(?,?,?,'PENDING',?)").bind(reviewId,row.listing_key,Number(prior?.evidence_revision??0)+1,finished.toISOString()),env.SPAWN_DB.prepare("UPDATE inventory_revalidation_state SET lifecycle_state='REMOVAL_REVIEW' WHERE listing_key=?").bind(row.listing_key));
    }
    await env.SPAWN_DB.batch(statements);results.push({listing_key:row.listing_key,outcome:assessment.outcome,http_status:httpStatus,next_eligible_at:next});
  }
  return {enabled:true,attempted:results.length,results};
}
