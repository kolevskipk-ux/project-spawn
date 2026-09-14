import type {Env} from './types';
import {supportWebhook} from './customer-support';
import {MERCADOLIBRE_ITEMS} from '../collector/marketplace-extension/mercadolibre-items.js';

// An unreadable page or disappearing sold-out banner is not purchase evidence.
export function possibleMercadoLibreRestock(record:any){
 const target=MERCADOLIBRE_ITEMS.find(item=>item.itemId===record?.itemId);
 return !!target&&typeof record.title==='string'&&/pok[eé]mon/i.test(record.title)&&/30th|30\s*(?:aniversario|anniversary|a[nñ]os)|celebration|celebraci[oó]n/i.test(record.title)&&target.titleTerms.every(pattern=>new RegExp(pattern,'i').test(record.title))&&['unknown','available'].includes(record.state)&&record.pageAvailability!=='sold_out'&&record.purchaseEnabled===true&&
  typeof record.priceMxn==='number'&&record.priceMxn>0&&record.visibleItemId===record.itemId&&
  ['SELLER_REVIEW_REQUIRED','SELLER_UNCONFIRMED','DELIVERY_LOCATION_UNCONFIRMED','VERIFIED_PURCHASE_CONTROL'].includes(record.reason);
}
export async function deliverMercadoLibreOperatorAlerts(env:Env,fetchFn:typeof fetch=fetch,now=new Date()){
 if(env.MERCADOLIBRE_OPERATOR_ALERTS_ENABLED!=='true')return;
 const webhook=supportWebhook(env.OPS_DISCORD_WEBHOOK_URL);if(!webhook)return;
 const time=now.toISOString(),cutoff=new Date(now.getTime()-45*60000).toISOString();
 for(const target of MERCADOLIBRE_ITEMS){
  const latest=await env.SPAWN_DB.prepare('SELECT id,observed_at,evidence_json FROM mercadolibre_browser_observations WHERE item_id=? ORDER BY observed_at DESC,received_at DESC,id DESC LIMIT 1').bind(target.itemId).first<{id:string;observed_at:string;evidence_json:string}>();
  if(!latest||latest.observed_at<cutoff||latest.observed_at>new Date(now.getTime()+60000).toISOString())continue;
  let record;try{record=JSON.parse(latest.evidence_json);}catch{continue;}
  if(!possibleMercadoLibreRestock(record))continue;
  const baseline=await env.SPAWN_DB.prepare("SELECT id FROM mercadolibre_browser_observations WHERE item_id=? AND observed_at<? AND (page_availability='sold_out' OR state='sold_out') ORDER BY observed_at DESC,received_at DESC,id DESC LIMIT 1").bind(target.itemId,latest.observed_at).first<{id:string}>();
  if(!baseline)continue;
  // Every return to sold-out starts a new episode. Repeated warm checks and
  // interrupted/blocked observations cannot generate a second alert for it.
  const id=`ml-restock:${target.itemId}:${baseline.id}`;
  await env.SPAWN_DB.prepare('INSERT OR IGNORE INTO mercadolibre_operator_alerts(id,item_id,observation_id,created_at) VALUES(?,?,?,?)').bind(id,target.itemId,latest.id,time).run();
  const lease=new Date(now.getTime()+120000).toISOString();
  const claimed=await env.SPAWN_DB.prepare('UPDATE mercadolibre_operator_alerts SET lease_until=?,attempts=attempts+1,observation_id=? WHERE id=? AND delivered_at IS NULL AND (lease_until IS NULL OR lease_until<=?) RETURNING id').bind(lease,latest.id,id,time).first();
  if(!claimed)continue;
  try{
   const destination=new URL(webhook);destination.searchParams.set('wait','true');
   const response=await fetchFn(destination.toString(),{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json'},body:JSON.stringify({username:'Garfield Ops',allowed_mentions:{parse:[]},content:`🔎 POSSIBLE MERCADO LIBRE RESTOCK — VERIFY\n${target.name}\nA purchase button and MX$${record.priceMxn} price appeared for the original listing after a sold-out check. Seller and delivery are not confirmed.\n${target.catalogUrl||target.url}\nChecked: ${latest.observed_at}\nOperator only — no customer alert sent.\nReference: ${id}`})});
   if(!response.ok){await response.body?.cancel();continue;}
   await response.body?.cancel();
   await env.SPAWN_DB.prepare('UPDATE mercadolibre_operator_alerts SET delivered_at=?,lease_until=NULL WHERE id=? AND lease_until=?').bind(time,id,lease).run();
  }catch{/* Retry on the existing minute tick, only while current evidence is fresh. */}
 }
}
