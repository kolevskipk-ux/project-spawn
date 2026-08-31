import { amazonAsin, canonicalizeUrl } from "./inventory";
import { normalizeVendor } from "./garfield";
import type { Env } from "./types";

export const SEED_SCHEMA_VERSION = 1;
export const MAX_SEED_ITEMS_PER_BATCH = 100;
export const MAX_SEED_ITEMS_PER_CAMPAIGN = 1000;
export const MAX_SEED_BODY_BYTES = 512_000;

export interface SeedItem {
  source_id: string;
  url: string;
  retailer: string;
  retailer_identifier?: string | null;
  product_name: string;
  product_family: string;
  print_series?: string | null;
  product_type: string;
  language: string;
  region?: string | null;
  observed_price_mxn?: number | null;
  seller?: string | null;
  fulfilled_by?: string | null;
  observed_at: string;
  evidence: string;
}

export interface SeedBatch {
  schema_version: number;
  campaign_id: string;
  batch_id: string;
  source: string;
  submitted_at: string;
  items: SeedItem[];
}

export interface ValidatedSeedItem {
  sourceId: string;
  canonicalUrl: string;
  retailer: string;
  retailerIdentifier: string | null;
  productName: string;
  productFamily: string;
  printSeries: string;
  productType: string;
  language: string;
  region: string | null;
  observedPriceMxn: number | null;
  seller: string | null;
  fulfilledBy: string | null;
  observedAt: string;
  evidence: string;
}

export interface SeedDisposition { source_id: string; disposition: "ACCEPTED" | "DUPLICATE" | "REJECTED"; reason: string; candidate_id?: string }

export function seedWatchCategory(item:Pick<ValidatedSeedItem,"productFamily"|"printSeries">):string{
  const value=`${item.productFamily} ${item.printSeries}`.toLowerCase();
  if(value.includes("30th"))return "30th_celebration";
  if(value.includes("delta reign"))return "delta_reign";
  if(value.includes("ascended heroes"))return "ascended_heroes";
  if(value.includes("prismatic evolutions"))return "prismatic_evolutions";
  return "pokemon_tcg";
}
export function seedRoutingKey(item:Pick<ValidatedSeedItem,"productFamily"|"printSeries">):"pokemon-main"|"pokemon-30th"|"delta-reign"{
  const category=seedWatchCategory(item);return category==="30th_celebration"?"pokemon-30th":category==="delta_reign"?"delta-reign":"pokemon-main";
}

const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
const iso = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const slug = (value: unknown, max: number) => typeof value === "string" && new RegExp(`^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,${max - 1}}$`).test(value) ? value : null;

export function validateSeedBatch(value: unknown): { ok: true; value: SeedBatch } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok:false, error:"invalid_body" };
  const body = value as Record<string,unknown>;
  if (body.schema_version !== SEED_SCHEMA_VERSION) return { ok:false, error:"unsupported_schema_version" };
  if (!slug(body.campaign_id,80)) return { ok:false, error:"invalid_campaign_id" };
  if (!slug(body.batch_id,80)) return { ok:false, error:"invalid_batch_id" };
  if (body.source !== "codex_one_off") return { ok:false, error:"invalid_source" };
  if (!iso(body.submitted_at)) return { ok:false, error:"invalid_submitted_at" };
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_SEED_ITEMS_PER_BATCH) return { ok:false, error:"invalid_item_count" };
  const sourceIds=body.items.map(item=>item&&typeof item==="object"?String((item as Record<string,unknown>).source_id??""):"").filter(Boolean);
  if(new Set(sourceIds).size!==sourceIds.length)return {ok:false,error:"duplicate_source_id_in_batch"};
  return { ok:true, value:body as unknown as SeedBatch };
}

export function validateSeedItem(value: unknown, now = new Date()): { ok: true; value: ValidatedSeedItem } | { ok: false; reason: string } {
  if (!value || typeof value !== "object") return { ok:false, reason:"invalid_item" };
  const item = value as Record<string,unknown>;
  const sourceId=slug(item.source_id,120), retailer=text(item.retailer,120), productName=text(item.product_name,240), family=text(item.product_family,120);
  const productType=text(item.product_type,80), language=text(item.language,40), evidence=text(item.evidence,2000), observedAt=iso(item.observed_at);
  if (!sourceId) return { ok:false, reason:"invalid_source_id" };
  if (!retailer || !productName || !family || !productType || !language || !evidence || !observedAt) return { ok:false, reason:"missing_required_evidence" };
  if(!/(pokemon|pokémon|tcg)/i.test(`${productName} ${family}`))return {ok:false,reason:"unsupported_product_scope"};
  if (Date.parse(observedAt) > now.getTime() + 300_000 || Date.parse(observedAt) < now.getTime() - 31 * 86_400_000) return { ok:false, reason:"invalid_observed_at" };
  let url: URL;
  try { url=new URL(String(item.url)); } catch { return { ok:false, reason:"invalid_url" }; }
  const hostname=url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || !hostname.includes(".") || /(^localhost$|\.localhost$|\.local$)/i.test(hostname) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) return { ok:false, reason:"unsafe_url" };
  const canonicalUrl=canonicalizeUrl(url.toString()), suppliedIdentifier=text(item.retailer_identifier,80), asin=amazonAsin(canonicalUrl);
  if (/(^|\.)amazon\.com\.mx$/i.test(url.hostname)) {
    if (!asin) return { ok:false, reason:"amazon_requires_direct_asin_url" };
    if (suppliedIdentifier && suppliedIdentifier.toUpperCase() !== asin) return { ok:false, reason:"identifier_url_mismatch" };
  } else if (url.pathname.split("/").filter(Boolean).length<1 || /^\/?(?:collections?|search|content)(?:\/|$)/i.test(url.pathname)) return { ok:false, reason:"not_direct_product_url" };
  const price=item.observed_price_mxn;
  if (price != null && (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 1_000_000)) return { ok:false, reason:"invalid_price" };
  return { ok:true, value:{ sourceId,canonicalUrl,retailer,retailerIdentifier:asin ?? suppliedIdentifier,productName,productFamily:family,
    printSeries:text(item.print_series,120) ?? family,productType,language:language.toLowerCase(),region:text(item.region,40),observedPriceMxn:price as number|null|undefined ?? null,
    seller:text(item.seller,160),fulfilledBy:text(item.fulfilled_by,160),observedAt,evidence } };
}

async function sha256(value: string): Promise<string> {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

export async function handleSeedCampaign(request: Request, env: Env): Promise<Response> {
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  if (request.headers.get("authorization") !== `Bearer ${env.RUN_TOKEN}`) return json({error:"unauthorized"},401);
  if (request.method !== "POST") return json({error:"method_not_allowed"},405);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")??"")) return json({error:"content_type_required"},415);
  const declared=Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_SEED_BODY_BYTES) return json({error:"payload_too_large"},413);
  const raw=await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_SEED_BODY_BYTES) return json({error:"payload_too_large"},413);
  let parsed:unknown; try { parsed=JSON.parse(raw); } catch { return json({error:"invalid_json"},400); }
  const checked=validateSeedBatch(parsed); if(!checked.ok) return json({error:checked.error},400);
  const body=checked.value, payloadHash=await sha256(raw), now=new Date(), receivedAt=now.toISOString();
  const existing=await env.SPAWN_DB.prepare("SELECT payload_hash FROM seed_batches WHERE batch_id=?").bind(body.batch_id).first<{payload_hash:string}>();
  if(existing) {
    if(existing.payload_hash!==payloadHash) return json({error:"batch_replay_mismatch"},409);
    const rows=await env.SPAWN_DB.prepare("SELECT source_id,disposition,reason,candidate_id FROM seed_candidate_evidence WHERE batch_id=? ORDER BY id").bind(body.batch_id).all<SeedDisposition>();
    return json({ok:true,replayed:true,campaign_id:body.campaign_id,batch_id:body.batch_id,results:rows.results});
  }
  const campaign=await env.SPAWN_DB.prepare("SELECT source,item_count FROM seed_campaigns WHERE campaign_id=?").bind(body.campaign_id).first<{source:string;item_count:number}>();
  if(campaign && campaign.source!==body.source) return json({error:"campaign_source_mismatch"},409);
  if((campaign?.item_count??0)+body.items.length>MAX_SEED_ITEMS_PER_CAMPAIGN) return json({error:"campaign_item_limit"},413);
  const seenSources=new Set<string>(), seenCandidates=new Set<string>(), results:SeedDisposition[]=[], accepted:ValidatedSeedItem[]=[];
  for(const rawItem of body.items) {
    const sourceId=rawItem&&typeof rawItem==="object"&&"source_id" in rawItem?String((rawItem as {source_id:unknown}).source_id):"invalid";
    const validated=validateSeedItem(rawItem,now);
    if(!validated.ok){results.push({source_id:sourceId,disposition:"REJECTED",reason:validated.reason});continue;}
    const item=validated.value;
    if(seenSources.has(item.sourceId)){results.push({source_id:item.sourceId,disposition:"REJECTED",reason:"duplicate_source_id_in_batch"});continue;}
    seenSources.add(item.sourceId);
    const candidateId=await sha256(`${normalizeVendor(item.retailer)}\n${item.canonicalUrl}`);
    const duplicate=seenCandidates.has(candidateId)||Boolean(await env.SPAWN_DB.prepare("SELECT 1 present FROM monitoring_candidates WHERE candidate_id=? OR (vendor_key=? AND source_url=?)").bind(candidateId,normalizeVendor(item.retailer),item.canonicalUrl).first());
    seenCandidates.add(candidateId); accepted.push(item);
    results.push({source_id:item.sourceId,disposition:duplicate?"DUPLICATE":"ACCEPTED",reason:duplicate?"existing_retailer_identity":"discovered_evidence_accepted",candidate_id:candidateId});
  }
  const counts={accepted:results.filter(r=>r.disposition==="ACCEPTED").length,duplicate:results.filter(r=>r.disposition==="DUPLICATE").length,rejected:results.filter(r=>r.disposition==="REJECTED").length};
  const statements:D1PreparedStatement[]=[];
  if(!campaign) statements.push(env.SPAWN_DB.prepare("INSERT INTO seed_campaigns(campaign_id,schema_version,source,submitted_at,received_at,actor,item_count,accepted_count,duplicate_count,rejected_count) VALUES(?,?,?,?,?,'operator',0,0,0,0)").bind(body.campaign_id,body.schema_version,body.source,new Date(body.submitted_at).toISOString(),receivedAt));
  statements.push(env.SPAWN_DB.prepare("INSERT INTO seed_batches(batch_id,campaign_id,submitted_at,received_at,payload_hash,item_count,accepted_count,duplicate_count,rejected_count) VALUES(?,?,?,?,?,?,?,?,?)").bind(body.batch_id,body.campaign_id,new Date(body.submitted_at).toISOString(),receivedAt,payloadHash,body.items.length,counts.accepted,counts.duplicate,counts.rejected));
  for(const result of results){
    const item=accepted.find(candidate=>candidate.sourceId===result.source_id);
    statements.push(env.SPAWN_DB.prepare("INSERT INTO seed_candidate_evidence(campaign_id,batch_id,source_id,candidate_id,canonical_url,retailer,retailer_identifier,product_name,disposition,reason,evidence_json,observed_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(body.campaign_id,body.batch_id,result.source_id,result.candidate_id??null,item?.canonicalUrl??null,item?.retailer??null,item?.retailerIdentifier??null,item?.productName??null,result.disposition,result.reason,JSON.stringify(item??{}),item?.observedAt??null,receivedAt));
    if(item&&result.disposition==="ACCEPTED") statements.push(env.SPAWN_DB.prepare(`INSERT INTO monitoring_candidates
      (candidate_id,source,source_url,source_listing_key,vendor,vendor_key,product_name,product_family,print_series,product_type,language,retailer_sku,observed_price_mxn,availability_state,discovered_at,review_eligible,routing_key)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'unknown',?,0,?) ON CONFLICT(candidate_id) DO NOTHING`).bind(result.candidate_id,"codex_seed",item.canonicalUrl,result.candidate_id,item.retailer,normalizeVendor(item.retailer),item.productName,item.productFamily,item.printSeries,item.productType,item.language,item.retailerIdentifier,item.observedPriceMxn,receivedAt,seedRoutingKey(item)));
    const asin=item?amazonAsin(item.canonicalUrl):null;
    if(item&&asin&&result.disposition==="ACCEPTED") statements.push(env.SPAWN_DB.prepare(`INSERT INTO amazon_watchlist
      (asin,product_name,product_url,watch_category,language,priority,lane,lifecycle_status,source,evidence,first_discovered_at,last_discovered_at,updated_at)
      VALUES(?,?,?,?,?,'NORMAL','normal','DISCOVERED','codex_seed',?,?,?,?)
      ON CONFLICT(asin) DO UPDATE SET last_discovered_at=excluded.last_discovered_at,updated_at=excluded.updated_at,evidence=CASE WHEN amazon_watchlist.lifecycle_status='DISCOVERED' THEN excluded.evidence ELSE amazon_watchlist.evidence END`)
      .bind(asin,item.productName,item.canonicalUrl,seedWatchCategory(item),item.language,item.evidence,receivedAt,receivedAt,receivedAt));
  }
  statements.push(env.SPAWN_DB.prepare("UPDATE seed_campaigns SET item_count=item_count+?,accepted_count=accepted_count+?,duplicate_count=duplicate_count+?,rejected_count=rejected_count+? WHERE campaign_id=?").bind(body.items.length,counts.accepted,counts.duplicate,counts.rejected,body.campaign_id));
  await env.SPAWN_DB.batch(statements);
  return json({ok:true,replayed:false,campaign_id:body.campaign_id,batch_id:body.batch_id,counts,results},207);
}
