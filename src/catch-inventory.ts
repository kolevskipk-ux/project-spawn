import type { Env } from "./types";
import { canonicalizeUrl } from "./inventory";
import { verifyCatchSignature } from "./benchmarks";

const STATES=new Set(["BUYABLE","PREORDER_BUYABLE","SOLD_OUT","UNKNOWN","BLOCKED","ERROR"]);
const ROUTES=new Set(["pokemon-30th","delta-reign","magic-hobbit"]);
const CATEGORIES=new Set(["30th_celebration","delta_reign","mtg_hobbit_collector_box"]);

interface CatchInventoryObservation {
  observation_id:string; source_product_id:string; canonical_product_id:string; product_name:string; asin:string;
  product_url:string; watch_category:string; routing_key:string; observed_state:string; price_mxn:number|null;
  seller:string|null; fulfilled_by:string|null; observed_at:string; evidence_type:string;
}

const bounded=(value:unknown,max:number)=>typeof value==="string"&&value.trim().length>0&&value.length<=max?value.trim():null;

export function parseCatchInventoryObservation(value:unknown):CatchInventoryObservation|null{
  if(!value||typeof value!=="object")return null;const item=value as Record<string,unknown>;
  const observation_id=bounded(item.observation_id,128),source_product_id=bounded(item.source_product_id,120),canonical_product_id=bounded(item.canonical_product_id,120),product_name=bounded(item.product_name,240);
  const asin=bounded(item.asin,10)?.toUpperCase()??null,product_url=bounded(item.product_url,500),watch_category=bounded(item.watch_category,80),routing_key=bounded(item.routing_key,40),observed_state=bounded(item.observed_state,30),observed_at=bounded(item.observed_at,40),evidence_type=bounded(item.evidence_type,40);
  if(!observation_id||!source_product_id||!canonical_product_id||!product_name||!asin||!product_url||!watch_category||!routing_key||!observed_state||!observed_at||!evidence_type)return null;
  if(!/^[A-Z0-9]{10}$/.test(asin)||!/^amazon-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source_product_id)||!CATEGORIES.has(watch_category)||!ROUTES.has(routing_key)||!STATES.has(observed_state)||!Number.isFinite(Date.parse(observed_at)))return null;
  let url:URL;try{url=new URL(product_url);}catch{return null;}if(url.protocol!=="https:"||url.hostname!=="www.amazon.com.mx"||!url.pathname.toUpperCase().includes(`/DP/${asin}`))return null;
  const price=item.price_mxn;if(price!==null&&(typeof price!=="number"||!Number.isFinite(price)||price<=0||price>1_000_000))return null;
  if(["BUYABLE","PREORDER_BUYABLE"].includes(observed_state)&&price===null)return null;
  const seller=item.seller===null?null:bounded(item.seller,160),fulfilled_by=item.fulfilled_by===null?null:bounded(item.fulfilled_by,160);
  if((item.seller!==null&&!seller)||(item.fulfilled_by!==null&&!fulfilled_by))return null;
  return {observation_id,source_product_id,canonical_product_id,product_name,asin,product_url:url.toString(),watch_category,routing_key,observed_state,price_mxn:price as number|null,seller,fulfilled_by,observed_at:new Date(observed_at).toISOString(),evidence_type};
}

async function sha256(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}

export async function handleCatchInventoryObservation(request:Request,env:Env):Promise<Response>{
  const body=await request.text(),timestamp=request.headers.get("x-spawn-timestamp"),signature=request.headers.get("x-spawn-signature");
  if(!await verifyCatchSignature(env.CATCH_INGEST_SECRET,timestamp,signature,body))return Response.json({error:"unauthorized"},{status:401});
  let parsed:unknown;try{parsed=JSON.parse(body);}catch{return Response.json({error:"invalid_json"},{status:400});}
  const observation=parseCatchInventoryObservation(parsed);if(!observation)return Response.json({error:"invalid_observation"},{status:400});
  const replay=await env.SPAWN_DB.prepare("SELECT observation_id FROM catch_inventory_observations WHERE observation_id=?").bind(observation.observation_id).first();
  if(replay)return Response.json({accepted:true,replayed:true,customer_event_created:false},{status:200});
  const published=await env.SPAWN_DB.prepare("SELECT canonical_product_id,product_name,watch_category,COALESCE(routing_key_v2,routing_key) routing_key FROM amazon_watchlist WHERE asin=? AND lifecycle_status='PUBLISHED'").bind(observation.asin).first<Record<string,unknown>>();
  if(!published||published.canonical_product_id!==observation.canonical_product_id||published.watch_category!==observation.watch_category||published.routing_key!==observation.routing_key)return Response.json({error:"not_published_or_identity_mismatch"},{status:409});
  const canonicalUrl=canonicalizeUrl(observation.product_url),listingKey=await sha256(canonicalUrl),now=new Date().toISOString();
  const recentAlternative=observation.observed_state==="SOLD_OUT"&&observation.evidence_type==="direct_page"?await env.SPAWN_DB.prepare("SELECT observed_at FROM catch_inventory_observations WHERE listing_key=? AND evidence_type='buying_options' AND observed_state IN ('BUYABLE','PREORDER_BUYABLE') AND observed_at>=? ORDER BY observed_at DESC LIMIT 1").bind(listingKey,new Date(Date.parse(observation.observed_at)-6*3600000).toISOString()).first():null;
  const trustworthy=["BUYABLE","PREORDER_BUYABLE","SOLD_OUT"].includes(observation.observed_state)&&!recentAlternative,available=["BUYABLE","PREORDER_BUYABLE"].includes(observation.observed_state);
  const status=trustworthy?(available?"available":"sold_out"):"unknown",availability=status;
  await env.SPAWN_DB.batch([
    env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO catch_inventory_observations(observation_id,listing_key,asin,observed_state,price_mxn,seller,fulfilled_by,evidence_type,observed_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(observation.observation_id,listingKey,observation.asin,observation.observed_state,observation.price_mxn,observation.seller,observation.fulfilled_by,observation.evidence_type,observation.observed_at,now),
    env.SPAWN_DB.prepare(`INSERT INTO inventory(listing_key,canonical_url,retailer,title,watch_category,retailer_sku,first_seen_at,last_seen_at,status,availability_state,price_mxn,language,language_evidence,last_change_type,product_id,print_series,seller,fulfilled_by,availability_evidence_type)
      VALUES(?,?,'Amazon México',?,?,?,?,?,?,?,?,'english','Published Catch catalog identity; availability supplied by authenticated Catch observation','baseline',?,CASE ? WHEN '30th_celebration' THEN '30th Celebration' WHEN 'delta_reign' THEN 'Delta Reign' ELSE 'Magic: The Gathering — The Hobbit' END,?,?,?)
      ON CONFLICT(listing_key) DO UPDATE SET title=excluded.title,product_id=excluded.product_id,last_seen_at=CASE WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at THEN excluded.last_seen_at ELSE inventory.last_seen_at END,status=CASE WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at THEN excluded.status ELSE inventory.status END,availability_state=CASE WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at THEN excluded.availability_state ELSE inventory.availability_state END,price_mxn=CASE WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at AND excluded.price_mxn IS NOT NULL THEN excluded.price_mxn ELSE inventory.price_mxn END,seller=CASE WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at THEN excluded.seller ELSE inventory.seller END,fulfilled_by=CASE WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at THEN excluded.fulfilled_by ELSE inventory.fulfilled_by END,availability_evidence_type=CASE WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at THEN excluded.availability_evidence_type ELSE inventory.availability_evidence_type END,last_change_type=CASE WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at AND excluded.status='available' AND inventory.status='sold_out' THEN 'restock' WHEN ? AND excluded.last_seen_at>=inventory.last_seen_at AND excluded.status='available' AND excluded.price_mxn IS NOT NULL AND inventory.price_mxn IS NOT NULL AND excluded.price_mxn<inventory.price_mxn THEN 'price_drop' ELSE inventory.last_change_type END`)
      .bind(listingKey,canonicalUrl,String(published.product_name||observation.product_name),observation.watch_category,observation.asin,observation.observed_at,observation.observed_at,status,availability,observation.price_mxn,observation.canonical_product_id,observation.watch_category,observation.seller,observation.fulfilled_by,observation.evidence_type,Number(trustworthy),Number(trustworthy),Number(trustworthy),Number(trustworthy),Number(trustworthy),Number(trustworthy),Number(trustworthy),Number(trustworthy),Number(trustworthy)),
    env.SPAWN_DB.prepare("INSERT INTO worker_state(key,value,updated_at) VALUES('last_catch_inventory_observation',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify({observation_id:observation.observation_id,asin:observation.asin,state:observation.observed_state,evidence_type:observation.evidence_type}),now)
  ]);
  return Response.json({accepted:true,replayed:false,listing_key:listingKey,customer_event_created:false},{status:202});
}
