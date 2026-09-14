import type {Env} from './types';
import {MERCADOLIBRE_ITEMS,exactMercadoLibreItem} from '../collector/marketplace-extension/mercadolibre-items.js';

const reasons=new Set(['UNCONFIRMED','WRONG_HOST','ACCOUNT_VERIFICATION','ITEM_REDIRECTED_OR_CHANGED','TITLE_UNCONFIRMED','PRIMARY_OFFER_MISSING','OFFER_ID_UNCONFIRMED','SELLER_REVIEW_REQUIRED','SELLER_MISMATCH','SELLER_UNCONFIRMED','DELIVERY_LOCATION_UNCONFIRMED','CONTRADICTORY_OFFER','EXPLICIT_SOLD_OUT','DELIVERY_UNAVAILABLE','VERIFIED_PURCHASE_CONTROL','PURCHASE_UNCONFIRMED','TAB_MISSING','TAB_CHANGED','ACQUISITION_FAILED','PAGE_SOLD_OUT_SELLER_UNCONFIRMED']);
export function validateMercadoLibreObservation(body:any,now=Date.now()){
 if(!body||typeof body!=='object'||Array.isArray(body))return null;
 const target=MERCADOLIBRE_ITEMS.find(item=>item.itemId===body.itemId);
 if(!target||typeof body.id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(body.id))return null;
 if(typeof body.observedAt!=='string')return null;
 const time=Date.parse(body.observedAt);
 if(!Number.isFinite(time)||time>now+60000||now-time>600000)return null;
 if(typeof body.url!=='string'||!exactMercadoLibreItem(body.url,target))return null;
 if(!['unknown','blocked','error','available','sold_out'].includes(body.state)||!reasons.has(body.reason))return null;
 if(typeof body.title!=='string'||body.title.length>400||typeof body.purchaseEnabled!=='boolean')return null;
 if(body.seller!==null&&(typeof body.seller!=='string'||body.seller.length>160))return null;
 if(body.sellerId!==null&&(typeof body.sellerId!=='string'||!/^\d{1,20}$/.test(body.sellerId)))return null;
 if(body.postcode!==null&&body.postcode!=='53100')return null;
 if(body.priceMxn!==null&&!(typeof body.priceMxn==='number'&&Number.isFinite(body.priceMxn)&&body.priceMxn>0&&body.priceMxn<100000))return null;
 if(body.visibleItemId!==null&&body.visibleItemId!==target.itemId)return null;
 const pageAvailability=body.pageAvailability??null;
 if(pageAvailability!==null&&pageAvailability!=='sold_out')return null;
 const correctTitle=/pok[eé]mon/i.test(body.title)&&/30th|30\s*(?:aniversario|anniversary|a[nñ]os)|celebration|celebraci[oó]n/i.test(body.title)&&target.titleTerms.every(pattern=>new RegExp(pattern,'i').test(body.title));
 if(pageAvailability==='sold_out'&&(!correctTitle||body.state!=='unknown'||body.purchaseEnabled||body.reason!=='PAGE_SOLD_OUT_SELLER_UNCONFIRMED'))return null;
 if(body.reason==='PAGE_SOLD_OUT_SELLER_UNCONFIRMED'&&pageAvailability!=='sold_out')return null;
 const verified=['available','sold_out'].includes(body.state);
 if(verified){
  // Seller policy is server-owned. All current targets intentionally remain unapproved.
  if(!target.expectedSellerId||body.sellerId!==target.expectedSellerId||!body.seller||!correctTitle||body.visibleItemId!==target.itemId||body.postcode!=='53100'||pageAvailability)return null;
  if(body.state==='available'&&(!body.purchaseEnabled||!body.priceMxn||body.reason!=='VERIFIED_PURCHASE_CONTROL'))return null;
  if(body.state==='sold_out'&&(body.purchaseEnabled||body.reason!=='EXPLICIT_SOLD_OUT'))return null;
 }
 // Explicit projection excludes URL advertising parameters, raw DOM, and account data.
 return {id:body.id,itemId:target.itemId,observedAt:new Date(time).toISOString(),url:target.url,title:body.title,state:body.state,reason:body.reason,priceMxn:body.priceMxn,seller:body.seller,sellerId:body.sellerId,postcode:body.postcode,purchaseEnabled:body.purchaseEnabled,visibleItemId:body.visibleItemId,pageAvailability};
}
export async function handleMercadoLibreBrowser(request:Request,env:Env):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!['/internal/mercadolibre-browser/observe','/internal/mercadolibre-browser/status'].includes(path))return null;
 if(!env.MERCADOLIBRE_COLLECTOR_TOKEN||env.MERCADOLIBRE_COLLECTOR_TOKEN===env.WALMART_COLLECTOR_TOKEN||request.headers.get('authorization')!==`Bearer ${env.MERCADOLIBRE_COLLECTOR_TOKEN}`)return Response.json({error:'unauthorized'},{status:401});
 if(path.endsWith('/status')&&request.method==='GET'){
  const rows=[];
  for(const item of MERCADOLIBRE_ITEMS){
   const latest=await env.SPAWN_DB.prepare('SELECT * FROM mercadolibre_browser_observations WHERE item_id=? ORDER BY observed_at DESC,received_at DESC,id DESC LIMIT 1').bind(item.itemId).first<any>();
   const lastVerified=await env.SPAWN_DB.prepare("SELECT * FROM mercadolibre_browser_observations WHERE item_id=? AND state IN ('available','sold_out') ORDER BY observed_at DESC,received_at DESC,id DESC LIMIT 1").bind(item.itemId).first();
   rows.push({itemId:item.itemId,name:item.name,latest,lastVerified,ageSeconds:latest?Math.max(0,Math.floor((Date.now()-Date.parse(latest.observed_at))/1000)):null});
  }
  return Response.json({source:'mercadolibre-browser',cadenceMinutes:30,customerAlertsEnabled:false,rows},{headers:{'cache-control':'no-store'}});
 }
 if(!path.endsWith('/observe')||request.method!=='POST')return new Response('Method not allowed',{status:405});
 const text=await request.text();if(text.length>6000)return new Response('Too large',{status:413});
 let raw;try{raw=JSON.parse(text);}catch{return Response.json({error:'invalid_json'},{status:400});}
 const record=validateMercadoLibreObservation(raw);if(!record)return Response.json({error:'invalid_observation'},{status:400});
 const evidence=JSON.stringify(record);
 // INSERT OR IGNORE plus a full normalized receipt comparison is race-safe and
 // prevents a reused ID from silently changing state, price or timestamps.
 await env.SPAWN_DB.prepare('INSERT OR IGNORE INTO mercadolibre_browser_observations(id,item_id,observed_at,received_at,state,page_availability,price_mxn,seller_id,evidence_json) VALUES(?,?,?,?,?,?,?,?,?)').bind(record.id,record.itemId,record.observedAt,new Date().toISOString(),record.state,record.pageAvailability,record.priceMxn,record.sellerId,evidence).run();
 const stored=await env.SPAWN_DB.prepare('SELECT evidence_json FROM mercadolibre_browser_observations WHERE id=?').bind(record.id).first<{evidence_json:string}>();
 if(stored?.evidence_json!==evidence)return Response.json({error:'observation_id_conflict'},{status:409});
 return Response.json({ok:true,id:record.id,state:record.state,pageAvailability:record.pageAvailability,inventoryUpdated:false,customerAlertSent:false});
}
