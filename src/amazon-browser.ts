import type {Env} from './types';
import {ITEMS,exact} from '../collector/amazon-extension/items.js';

const reasons=new Set(['OFFER_UNCONFIRMED','WRONG_SITE','CHALLENGE_OR_SIGN_IN','PRODUCT_IDENTITY_UNCONFIRMED','CONTRADICTORY_OFFER','EXPLICIT_PRODUCT_UNAVAILABLE','DELIVERY_UNAVAILABLE','VERIFIED_FEATURED_OFFER','PRICE_OR_SELLER_UNCONFIRMED','NO_VERIFIED_FEATURED_OFFER','BUYING_OPTIONS_CONTROL_VISIBLE','TAB_MISSING','REDIRECTED_OR_CHALLENGED','NO_RESULT','PAGE_CHECK_FAILED']);
const states=new Set(['available','sold_out','buying_options_shown','unknown','blocked','error']);
export function validateAmazonBrowserObservation(body:any,now=Date.now()){
 if(!body||typeof body!=='object'||Array.isArray(body)||body.schemaVersion!==1||body.source!=='amazon_edge')return null;
 const target=ITEMS.find(item=>item.asin===body.asin);
 if(!target||typeof body.id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(body.id)||typeof body.url!=='string'||!exact(body.url,target))return null;
 if(typeof body.observedAt!=='string')return null;
 const time=Date.parse(body.observedAt);if(!Number.isFinite(time)||time>now+60000||now-time>600000)return null;
 if(!states.has(body.state)||!reasons.has(body.reason)||typeof body.title!=='string'||body.title.length>300)return null;
 if(body.buyingOptionsShown!==null&&typeof body.buyingOptionsShown!=='boolean')return null;
 const signal=body.state==='buying_options_shown';
 if(signal!==(body.buyingOptionsShown===true)||signal!==(body.reason==='BUYING_OPTIONS_CONTROL_VISIBLE'))return null;
 if(body.buyingOptionsShown!==null&&!new RegExp(target.titlePattern,'i').test(body.title))return null;
 // Client classifications are retained only as diagnostics, never stock authority.
 if(body.state==='available'&&(body.reason!=='VERIFIED_FEATURED_OFFER'||body.buyingOptionsShown!==false))return null;
 if(body.state==='sold_out'&&(body.reason!=='EXPLICIT_PRODUCT_UNAVAILABLE'||body.buyingOptionsShown!==false))return null;
 return {schemaVersion:1,source:'amazon_edge',id:body.id,asin:target.asin,url:target.url,observedAt:new Date(time).toISOString(),title:body.title,collectorState:body.state,reason:body.reason,buyingOptionsShown:body.buyingOptionsShown,
   availabilityState:'unknown',label:signal?'Buying options shown — click to see offers':null};
}

export async function handleAmazonBrowser(request:Request,env:Env):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!['/internal/amazon-browser/observe','/internal/amazon-browser/status'].includes(path))return null;
 const authorization=request.headers.get('authorization');
 const collector=env.AMAZON_LAPTOP_COLLECTOR_TOKEN&&authorization===`Bearer ${env.AMAZON_LAPTOP_COLLECTOR_TOKEN}`?'laptop':'desktop';
 const token=collector==='laptop'?env.AMAZON_LAPTOP_COLLECTOR_TOKEN:env.AMAZON_COLLECTOR_TOKEN;
 if(!token||env.AMAZON_COLLECTOR_TOKEN===env.AMAZON_LAPTOP_COLLECTOR_TOKEN||[env.WALMART_COLLECTOR_TOKEN,env.MERCADOLIBRE_COLLECTOR_TOKEN,env.CATCH_INGEST_SECRET,env.RUN_TOKEN].includes(token)||authorization!==`Bearer ${token}`)return Response.json({error:'unauthorized'},{status:401});
 if(path.endsWith('/status')&&request.method==='GET'){
   const rows=[];
   for(const item of ITEMS){
     const latest=await env.SPAWN_DB.prepare('SELECT evidence_json,observed_at FROM amazon_browser_observations WHERE asin=? ORDER BY observed_at DESC,received_at DESC,id DESC LIMIT 1').bind(item.asin).first<{evidence_json:string;observed_at:string}>();
     const ageSeconds=latest?Math.max(0,Math.floor((Date.now()-Date.parse(latest.observed_at))/1000)):null;
     const observation=latest?JSON.parse(latest.evidence_json):null;
     rows.push({asin:item.asin,name:item.name,latest:observation,ageSeconds,stale:ageSeconds===null||ageSeconds>900});
   }
   return Response.json({source:'amazon_edge',customerAlertsEnabled:false,inventoryUpdated:false,rows},{headers:{'cache-control':'no-store'}});
 }
 if(!path.endsWith('/observe')||request.method!=='POST')return new Response('Method not allowed',{status:405});
 const text=await request.text();if(text.length>4000)return new Response('Too large',{status:413});
 let raw;try{raw=JSON.parse(text);}catch{return Response.json({error:'invalid_json'},{status:400});}
 const record=validateAmazonBrowserObservation(raw);if(!record)return Response.json({error:'invalid_observation'},{status:400});
 const published=await env.SPAWN_DB.prepare("SELECT asin FROM amazon_watchlist WHERE asin=? AND lifecycle_status='PUBLISHED' AND watch_category='30th_celebration'").bind(record.asin).first();
 if(!published)return Response.json({error:'not_published'},{status:409});
 const evidence=JSON.stringify({...record,collector});
 await env.SPAWN_DB.prepare('INSERT OR IGNORE INTO amazon_browser_observations(id,asin,observed_at,received_at,collector_state,buying_options_shown,evidence_json) VALUES(?,?,?,?,?,?,?)').bind(record.id,record.asin,record.observedAt,new Date().toISOString(),record.collectorState,record.buyingOptionsShown===null?null:Number(record.buyingOptionsShown),evidence).run();
 const receipt=await env.SPAWN_DB.prepare('SELECT evidence_json FROM amazon_browser_observations WHERE id=?').bind(record.id).first<{evidence_json:string}>();
 if(!receipt)return Response.json({error:'observation_not_persisted'},{status:500});
 if(receipt.evidence_json!==evidence)return Response.json({error:'observation_id_conflict'},{status:409});
 return Response.json({ok:true,id:record.id,availabilityState:'unknown',label:record.label,inventoryUpdated:false,customerAlertSent:false});
}
