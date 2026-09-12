import type {Env} from './types';

export interface InventoryLink {
  url:string; product:string; source:string; route:string; kind:string; event_id:string;
}
const sources=new Set(['inventory_alert','inventory_page','watchlist_update','daily_watchlist','campaign']);
const headers={'cache-control':'no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow'};
export function safeDestination(value:unknown):string|null {
  if(typeof value!=='string'||value.length>2048)return null;
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||
      !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)||
      /(^|\.)(localhost|local|internal|invalid|onion)$/i.test(url.hostname)||url.pathname.startsWith('/r/'))return null;
    return url.href;
  }catch{return null;}
}
export function parseInventoryLink(value:unknown):InventoryLink|null {
  if(!value||typeof value!=='object')return null;
  const row=value as Record<string,unknown>,url=safeDestination(row.url);
  if(!url||!sources.has(String(row.source)))return null;
  for(const field of ['product','route','kind','event_id'])if(typeof row[field]!=='string'||String(row[field]).length>180)return null;
  return {url,product:row.product as string,source:row.source as string,route:row.route as string,kind:row.kind as string,event_id:row.event_id as string};
}
export async function registerInventoryLinks(env:Env,rows:InventoryLink[]):Promise<string[]> {
  if(env.INVENTORY_LINK_TRACKING_ENABLED!=='true')return rows.map(row=>row.url);
  const base=new URL(env.PUBLIC_BASE_URL);
  if(base.protocol!=='https:')throw new Error('Invalid tracking origin');
  const links=await Promise.all(rows.map(async row=>{
    const parsed=parseInventoryLink(row);if(!parsed)throw new Error('Invalid inventory link');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(parsed)));
    const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    return {id,row:parsed};
  }));
  // Bounded batches; no requests to the retailer are made.
  for(let i=0;i<links.length;i+=50)await env.SPAWN_DB.batch(links.slice(i,i+50).map(({id,row})=>env.SPAWN_DB.prepare(
    'INSERT OR IGNORE INTO outbound_links(id,destination,retailer,product,source,route,kind,event_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
  ).bind(id,row.url,new URL(row.url).hostname,row.product,row.source,row.route,row.kind,row.event_id,new Date().toISOString())));
  return links.map(({id})=>new URL(`/r/${id}`,base).href);
}
export function clickCategory(request:Request):'filtered_click'|'automated'|'unclassified' {
  const agent=request.headers.get('user-agent')||'';
  const purpose=['purpose','sec-purpose','x-purpose'].map(h=>request.headers.get(h)||'').join(' ');
  if(/prefetch|preview|prerender/i.test(purpose)||/bot|crawler|spider|discord|slack|facebookexternalhit|whatsapp|telegram|skypeuripreview|headless/i.test(agent))return 'automated';
  // A browser-looking request is only a filtered click, never proof of a person.
  return /Mozilla\//.test(agent)?'filtered_click':'unclassified';
}
export async function inventoryRedirect(request:Request,env:Env,ctx?:Pick<ExecutionContext,'waitUntil'>):Promise<Response|null> {
  const path=new URL(request.url).pathname;if(!path.startsWith('/r/'))return null;
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD'}});
  const id=path.slice(3);if(!/^[a-f0-9]{64}$/.test(id))return new Response('Link not found',{status:404,headers});
  const link=await env.SPAWN_DB.prepare('SELECT destination FROM outbound_links WHERE id=?').bind(id).first<{destination:string}>();
  const destination=safeDestination(link?.destination);
  if(!destination)return new Response('Link not found',{status:404,headers});
  // Existing links keep redirecting even when new tracking is disabled.
  if(request.method==='GET'&&env.INVENTORY_LINK_TRACKING_ENABLED==='true'){
    const count=env.SPAWN_DB.prepare('INSERT INTO outbound_click_days(link_id,day,category,clicks) VALUES(?,?,?,1) ON CONFLICT(link_id,day,category) DO UPDATE SET clicks=clicks+1')
      .bind(id,new Date().toISOString().slice(0,10),clickCategory(request)).run().catch(()=>{console.error('Inventory click count unavailable');});
    if(ctx)ctx.waitUntil(count);else await count;
  }
  return new Response(null,{status:302,headers:{...headers,location:destination}});
}
export async function registerInventoryLinksRoute(request:Request,env:Env):Promise<Response|null> {
  if(new URL(request.url).pathname!=='/internal/garfield/inventory-links')return null;
  if(!env.CATCH_INGEST_SECRET||request.headers.get('authorization')!==`Bearer ${env.CATCH_INGEST_SECRET}`)return Response.json({error:'unauthorized'},{status:401});
  if(request.method!=='POST')return new Response(null,{status:405});
  if(env.INVENTORY_LINK_TRACKING_ENABLED!=='true')return Response.json({error:'tracking_disabled'},{status:503});
  if(Number(request.headers.get('content-length'))>65536)return new Response(null,{status:413});
  const body=await request.text();if(body.length>65536)return new Response(null,{status:413});
  let input;try{input=JSON.parse(body);}catch{return new Response(null,{status:400});}
  if(!Array.isArray(input.links)||input.links.length<1||input.links.length>50)return new Response(null,{status:400});
  const rows=input.links.map(parseInventoryLink);if(rows.some((row:InventoryLink|null)=>!row))return new Response(null,{status:400});
  return Response.json({links:await registerInventoryLinks(env,rows)},{headers:{'cache-control':'no-store'}});
}
export async function inventoryClickReport(env:Env,url:URL):Promise<Response> {
  const end=url.searchParams.get('to')||new Date().toISOString().slice(0,10);
  const start=url.searchParams.get('from')||new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(!valid(start)||!valid(end)||start>end||Date.parse(end)-Date.parse(start)>365*86400000)return Response.json({error:'invalid_date_range'},{status:400});
  const result=await env.SPAWN_DB.prepare(`SELECT c.day,l.retailer,l.product,l.source,l.route,l.kind,l.event_id,l.id link_id,c.category,c.clicks
    FROM outbound_click_days c JOIN outbound_links l ON l.id=c.link_id WHERE c.day BETWEEN ? AND ? ORDER BY c.day DESC,l.id,c.category LIMIT 10001`).bind(start,end).all();
  return Response.json({from:start,to:end,timezone:'UTC',metric:'Requests, not unique visitors or purchases. Filtered clicks exclude known bots and previews; repeated clicks remain included.',truncated:result.results.length>10000,rows:result.results.slice(0,10000)},{headers:{'cache-control':'no-store'}});
}
