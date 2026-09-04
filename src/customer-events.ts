import type { Env } from "./types";

const EVENT_TYPES=new Set(["LISTING_PUBLISHED","BECAME_BUYABLE","PRICE_DROP","CAMPAIGN_PUBLISHED"]);
const ROUTING_KEYS=new Set(["pokemon-main","pokemon-30th","delta-reign","magic-hobbit"]);
const TERMINAL_STATUSES=new Set(["DELIVERED","SUPPRESSED"]);

export interface CustomerEventAck { event_id:string; status:"DELIVERED"|"FAILED"|"SUPPRESSED"; error?:string|null; }

export function validateCustomerEventAck(value:unknown):CustomerEventAck|null {
  if(!value||typeof value!=="object")return null;
  const body=value as Record<string,unknown>,eventId=String(body.event_id||""),status=String(body.status||"");
  if(!/^[a-f0-9]{64}$/i.test(eventId)||!["DELIVERED","FAILED","SUPPRESSED"].includes(status))return null;
  const error=body.error==null?null:String(body.error).trim().slice(0,240);
  if(status==="FAILED"&&!error)return null;
  return {event_id:eventId,status:status as CustomerEventAck["status"],error};
}

function authorized(request:Request,env:Env){return Boolean(env.CATCH_INGEST_SECRET)&&request.headers.get("authorization")===`Bearer ${env.CATCH_INGEST_SECRET}`;}
function response(body:unknown,status=200){return Response.json(body,{status,headers:{"cache-control":"no-store"}});}

export async function handleCustomerEvents(request:Request,url:URL,env:Env):Promise<Response|null>{
  if(url.pathname!=="/internal/garfield/customer-events"&&url.pathname!=="/internal/garfield/customer-events/ack")return null;
  if(!authorized(request,env))return response({error:"unauthorized"},401);
  if(url.pathname.endsWith("/ack")){
    if(request.method!=="POST")return response({error:"method_not_allowed"},405);
    let parsed:unknown;try{parsed=await request.json();}catch{return response({error:"invalid_json"},400);}
    const ack=validateCustomerEventAck(parsed);if(!ack)return response({error:"invalid_ack"},400);
    const current=await env.SPAWN_DB.prepare("SELECT delivery_status,'listing' source FROM customer_inventory_events WHERE event_id=? UNION ALL SELECT delivery_status,'campaign' source FROM campaign_customer_events WHERE event_id=?").bind(ack.event_id,ack.event_id).first<{delivery_status:string;source:string}>();
    if(!current)return response({error:"event_not_found"},404);
    if(TERMINAL_STATUSES.has(current.delivery_status)&&current.delivery_status!==ack.status)return response({error:"terminal_ack_conflict"},409);
    const now=new Date().toISOString();
    const table=current.source==="campaign"?"campaign_customer_events":"customer_inventory_events";
    await env.SPAWN_DB.prepare(`UPDATE ${table} SET delivery_status=?,acknowledged_at=? WHERE event_id=? AND delivery_status NOT IN ('DELIVERED','SUPPRESSED')`).bind(ack.status,now,ack.event_id).run();
    return response({ok:true,event_id:ack.event_id,status:TERMINAL_STATUSES.has(current.delivery_status)?current.delivery_status:ack.status,replayed:TERMINAL_STATUSES.has(current.delivery_status)});
  }
  if(request.method!=="GET")return response({error:"method_not_allowed"},405);
  const limit=Math.max(1,Math.min(50,Number(url.searchParams.get("limit"))||25)),cursor=String(url.searchParams.get("cursor")||"");
  if(cursor&&!/^[a-f0-9]{64}$/i.test(cursor))return response({error:"invalid_cursor"},400);
  const rows=await env.SPAWN_DB.prepare(`SELECT event_id,schema_version,event_type,listing_key,source_observation_id,routing_key,payload_json,occurred_at,created_at FROM customer_inventory_events WHERE delivery_status IN ('PENDING','FAILED') AND event_id>?
    UNION ALL SELECT event_id,schema_version,event_type,'campaign:'||campaign_id listing_key,campaign_id source_observation_id,routing_key,payload_json,occurred_at,created_at FROM campaign_customer_events WHERE delivery_status IN ('PENDING','FAILED') AND event_id>?
    ORDER BY event_id LIMIT ?`).bind(cursor,cursor,limit+1).all<Record<string,unknown>>();
  const page=rows.results.slice(0,limit),events=[];
  for(const row of page){
    if(![1,2,3].includes(Number(row.schema_version))||!EVENT_TYPES.has(String(row.event_type))||!ROUTING_KEYS.has(String(row.routing_key)))continue;
    let payload:unknown;try{payload=JSON.parse(String(row.payload_json));}catch{continue;}
    events.push({event_id:row.event_id,schema_version:row.schema_version,event_type:row.event_type,listing_key:row.listing_key,source_observation_id:row.source_observation_id,routing_key:row.routing_key,payload,occurred_at:row.occurred_at,created_at:row.created_at});
  }
  return response({schema_version:3,events,next_cursor:rows.results.length>limit?String(page.at(-1)?.event_id||cursor):null});
}
