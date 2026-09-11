import type {Env} from './types';
export const WALMART_ITEMS=['00019621415869','00019621415836'];
export function validateWalmartObservation(body:any,now=Date.now()) {
  if(!body||typeof body!=='object'||!WALMART_ITEMS.includes(body.itemId)||typeof body.id!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(body.id))return null;
  const time=Date.parse(body.observedAt);
  if(!Number.isFinite(time)||time>now+60000||now-time>600000)return null;
  if(!['available','sold_out','unknown','blocked','error'].includes(body.state))return null;
  if(typeof body.title!=='string'||body.title.length>400||typeof body.offerText!=='string'||body.offerText.length>1500)return null;
  if(body.postcode!==null&&body.postcode!=='53100')return null;
  if(body.priceMxn!==null&&!(typeof body.priceMxn==='number'&&Number.isFinite(body.priceMxn)&&body.priceMxn>0&&body.priceMxn<100000))return null;
  if(body.seller!==null&&body.seller!=='Walmart')return null;
  let url;try{url=new URL(body.url);}catch{return null;}
  if(url.protocol!=='https:'||url.hostname!=='www.walmart.com.mx'||!url.pathname.endsWith('/'+body.itemId)||url.username||url.password)return null;
  const good=['available','sold_out'].includes(body.state);
  const correctTitle=/30th/i.test(body.title)&&(/15869$/.test(body.itemId)?/ultra.*premium.*day.*night/i.test(body.title):/ditto.*premium/i.test(body.title));
  if(good&&(!correctTitle||body.postcode!=='53100'||body.seller!=='Walmart'))return null;
  if(body.state==='sold_out'&&!/\bagotado\b/i.test(body.offerText))return null;
  if(body.state==='available'&&(body.purchaseEnabled!==true||!body.priceMxn||/agotado|envío no disponible|envio no disponible/i.test(body.offerText)))return null;
  return {...body,observedAt:new Date(time).toISOString(),url:url.origin+url.pathname,good};
}
export async function handleWalmartBrowser(request:Request,env:Env):Promise<Response|null>{
  const path=new URL(request.url).pathname;
  if(!['/internal/walmart-browser/observe','/internal/walmart-browser/status'].includes(path))return null;
  if(!env.WALMART_COLLECTOR_TOKEN||request.headers.get('authorization')!==`Bearer ${env.WALMART_COLLECTOR_TOKEN}`)return Response.json({error:'unauthorized'},{status:401});
  if(path.endsWith('/status')&&request.method==='GET'){
    const rows=[];
    for(const itemId of WALMART_ITEMS){
      const latest=await env.SPAWN_DB.prepare('SELECT * FROM walmart_browser_observations WHERE item_id=? ORDER BY observed_at DESC LIMIT 1').bind(itemId).first();
      const lastVerified=await env.SPAWN_DB.prepare("SELECT * FROM walmart_browser_observations WHERE item_id=? AND state IN ('available','sold_out') ORDER BY observed_at DESC LIMIT 1").bind(itemId).first();
      rows.push({itemId,latest,lastVerified});
    }
    return Response.json({source:'independent-browser',cadenceMinutes:30,rows},{headers:{'cache-control':'no-store'}});
  }
  if(!path.endsWith('/observe')||request.method!=='POST')return new Response('Method not allowed',{status:405});
  const text=await request.text();if(text.length>6000)return new Response('Too large',{status:413});
  let raw;try{raw=JSON.parse(text);}catch{return new Response('Invalid JSON',{status:400});}
  const b=validateWalmartObservation(raw);if(!b)return Response.json({error:'invalid_observation'},{status:400});
  const prior=await env.SPAWN_DB.prepare('SELECT evidence_json FROM walmart_browser_observations WHERE id=?').bind(b.id).first<{evidence_json:string}>();
  const evidence=JSON.stringify({url:b.url,title:b.title,offerText:b.offerText,purchaseEnabled:b.purchaseEnabled===true});
  if(prior)return Response.json({ok:prior.evidence_json===evidence,replayed:true},{status:prior.evidence_json===evidence?200:409});
  const queries=[env.SPAWN_DB.prepare('INSERT INTO walmart_browser_observations(id,item_id,observed_at,received_at,state,price_mxn,seller,postcode,evidence_json) VALUES(?,?,?,?,?,?,?,?,?)').bind(b.id,b.itemId,b.observedAt,new Date().toISOString(),b.state,b.priceMxn,b.seller,b.postcode,evidence)];
  if(b.good)queries.push(env.SPAWN_DB.prepare("UPDATE inventory SET status=?,availability_state=?,price_mxn=?,seller=?,last_seen_at=?,availability_observed_at=?,pricing_observed_at=?,availability_freshness_status='LIVE_MONITORED',price_verification_status=? WHERE retailer_sku=? AND canonical_url LIKE 'https://www.walmart.com.mx/ip/%' AND (availability_observed_at IS NULL OR availability_observed_at<?)").bind(b.state,b.state,b.priceMxn,b.seller,b.observedAt,b.observedAt,b.priceMxn?b.observedAt:null,b.priceMxn?'VERIFIED':'PENDING',b.itemId,b.observedAt));
  await env.SPAWN_DB.batch(queries);
  return Response.json({ok:true,state:b.state,inventoryUpdated:b.good});
}
