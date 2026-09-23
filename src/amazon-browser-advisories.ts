import type {Env} from './types';
import {ITEMS} from '../collector/amazon-extension/items.js';

export async function claimAmazonBrowserAdvisories(env:Env,now=new Date()){
 const time=now.toISOString(),cutoff=new Date(now.getTime()-10*60000).toISOString(),cooldown=new Date(now.getTime()-60*60000).toISOString(),events=[];
 for(const item of ITEMS){
  const published=await env.SPAWN_DB.prepare("SELECT asin FROM amazon_watchlist WHERE asin=? AND lifecycle_status='PUBLISHED' AND watch_category='30th_celebration'").bind(item.asin).first();
  if(!published)continue;
  const latest=await env.SPAWN_DB.prepare('SELECT id,observed_at,collector_state,evidence_json,buying_options_shown FROM amazon_browser_observations WHERE asin=? ORDER BY observed_at DESC,received_at DESC,id DESC LIMIT 1').bind(item.asin).first<{id:string;observed_at:string;buying_options_shown:number|null;collector_state:string;evidence_json:string}>();
  if(!latest||latest.observed_at<cutoff||latest.observed_at>time||latest.buying_options_shown===null)continue;
  const evidence=JSON.parse(latest.evidence_json),offer=evidence.offer;
 const featured=latest.collector_state==='available'&&offer?.purchaseEnabled===true&&typeof offer.priceMxn==='number'&&Number.isFinite(offer.priceMxn)&&offer.priceMxn>0&&typeof offer.seller==='string'&&offer.seller.trim().length>0&&offer.seller.length<=120;
 // Unknown/errors and legacy AVAILABLE receipts lacking offer details never rearm an episode.
 const signal=featured?2:latest.buying_options_shown===1?1:latest.collector_state==='sold_out'?0:null;
 if(signal===null)continue;
 const id=`amazon-${featured?'featured':'options'}:${item.asin}:${latest.id}`;
  const expires=new Date(Date.parse(latest.observed_at)+10*60000).toISOString();
  // D1 batches are transactional. Queue creation and state advancement are one
  // operation, so overlapping polls and two collectors cannot create two episodes.
  await env.SPAWN_DB.batch([
   env.SPAWN_DB.prepare('INSERT OR IGNORE INTO amazon_browser_advisory_state(asin) VALUES(?)').bind(item.asin),
   env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO amazon_browser_advisories(id,asin,observation_id,observed_at,created_at,expires_at)
    SELECT ?,?,?,?,?,? FROM amazon_browser_advisory_state WHERE asin=? AND last_observed_at<? AND last_signal<? AND ?>0 AND (last_queued_at IS NULL OR last_queued_at<=? OR (?=2 AND NOT EXISTS(SELECT 1 FROM amazon_browser_advisories WHERE asin=? AND id LIKE 'amazon-featured:%' AND created_at>?)))`).bind(id,item.asin,latest.id,latest.observed_at,time,expires,item.asin,latest.observed_at,signal,signal,cooldown,signal,item.asin,cooldown),
   env.SPAWN_DB.prepare(`UPDATE amazon_browser_advisory_state SET last_signal=?,last_observed_at=?,last_queued_at=CASE WHEN EXISTS(SELECT 1 FROM amazon_browser_advisories WHERE id=?) THEN ? ELSE last_queued_at END WHERE asin=? AND last_observed_at<?`).bind(signal,latest.observed_at,id,time,item.asin,latest.observed_at),
   env.SPAWN_DB.prepare("UPDATE amazon_browser_advisories SET status='EXPIRED' WHERE asin=? AND status='PENDING' AND (expires_at<=? OR ?=0 OR (?=2 AND id LIKE 'amazon-options:%') OR (?=1 AND id LIKE 'amazon-featured:%'))").bind(item.asin,time,signal,signal,signal)
  ]);
  if(signal===0)continue;
  const claimToken=crypto.randomUUID(),lease=new Date(now.getTime()+120000).toISOString();
  const claimed=await env.SPAWN_DB.prepare(`UPDATE amazon_browser_advisories SET claim_token=?,lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM amazon_browser_advisories WHERE asin=? AND status='PENDING' AND expires_at>? AND (lease_until IS NULL OR lease_until<=?) ORDER BY created_at DESC LIMIT 1) AND status='PENDING' AND (lease_until IS NULL OR lease_until<=?) RETURNING id,asin,observation_id,observed_at,expires_at`).bind(claimToken,lease,item.asin,time,time,time).first<{id:string;asin:string;observation_id:string;observed_at:string;expires_at:string}>();
  if(claimed){
   const original=await env.SPAWN_DB.prepare('SELECT evidence_json FROM amazon_browser_observations WHERE id=?').bind(claimed.observation_id).first<{evidence_json:string}>();
   const originalOffer=original?JSON.parse(original.evidence_json).offer:null;
   const isFeatured=claimed.id.startsWith('amazon-featured:');
   events.push({...claimed,claim_token:claimToken,kind:isFeatured?'FEATURED_OFFER_AVAILABLE':'BUYING_OPTIONS_SHOWN',routing_key:'pokemon-30th',url:item.url,product_name:item.name,stock_verified:false,...(isFeatured?{offer:originalOffer}:{})});
  }
 }
 return events;
}

export async function handleAmazonBrowserAdvisories(request:Request,env:Env):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!['/internal/garfield/amazon-browser-advisories/claim','/internal/garfield/amazon-browser-advisories/ack'].includes(path))return null;
 if(!env.CATCH_INGEST_SECRET||request.headers.get('authorization')!==`Bearer ${env.CATCH_INGEST_SECRET}`)return Response.json({error:'unauthorized'},{status:401});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(path.endsWith('/claim')){
  if(env.AMAZON_BROWSER_ADVISORIES_ENABLED!=='true')return Response.json({events:[],enabled:false});
  return Response.json({events:await claimAmazonBrowserAdvisories(env),enabled:true});
 }
 let body:any;try{const raw=await request.text();if(raw.length>1000)return new Response('Too large',{status:413});body=JSON.parse(raw);}catch{return Response.json({error:'invalid_json'},{status:400});}
 if(!body||typeof body.id!=='string'||body.id.length>160||typeof body.claim_token!=='string'||body.claim_token.length>64||!['DELIVERED','FAILED','SUPPRESSED'].includes(body.status))return Response.json({error:'invalid_ack'},{status:400});
 const current=await env.SPAWN_DB.prepare('SELECT status,claim_token FROM amazon_browser_advisories WHERE id=?').bind(body.id).first<{status:string;claim_token:string}>();
 if(!current||current.claim_token!==body.claim_token)return Response.json({error:'claim_mismatch'},{status:409});
 if(current.status===body.status)return Response.json({ok:true,replayed:true});
 if(current.status!=='PENDING')return Response.json({error:'terminal_conflict'},{status:409});
 if(body.status==='FAILED')return Response.json({ok:true,retry_after_lease:true});
 const changed=await env.SPAWN_DB.prepare("UPDATE amazon_browser_advisories SET status=?,delivered_at=CASE WHEN ?='DELIVERED' THEN ? ELSE NULL END,lease_until=NULL WHERE id=? AND claim_token=? AND status='PENDING' RETURNING id").bind(body.status,body.status,new Date().toISOString(),body.id,body.claim_token).first();
 return Response.json({ok:!!changed}, {status:changed?200:409});
}
