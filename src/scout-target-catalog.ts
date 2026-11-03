import type {Env} from './types';
import {ITEMS} from './amazon-browser-targets';
export const SCOUT_TARGET_CAP=20;
export type ScoutTarget={asin:string;name:string;url:string;titlePattern:string;category:string;routingKey:string};
export type PublishedTarget={asin:string;product_name:string;product_url:string;watch_category:string;language:string;approved_at:string};
const routes:Record<string,string>={'30th_celebration':'pokemon-30th','delta_reign':'delta-reign','mtg_hobbit_collector_box':'magic-hobbit'};
const reviewed:Record<string,string>={B0HG3JBNBN:'delta.*(?:three|3).*booster.*blister',B0HG47DGH4:'delta.*build.*battle',B0GXC89N66:'hobbit.*collector.*booster.*(?:box|display)'};
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function generatedPattern(row:PublishedTarget){
 if(row.watch_category==='mtg_hobbit_collector_box'&&!/hobbit(?=.*collector)(?=.*booster)(?=.*(?:box|display))/i.test(row.product_name))return null;
 const words=row.product_name.toLowerCase().replace(/\b(?:asin|b0[a-z0-9]{8})\b/g,'').match(/[a-z0-9]+/g)||[];
 const tokens=[...new Set(words.filter(w=>w.length>=3&&!['pokemon','pok','mon','tcg','the','magic','gathering','collection','product','english','spanish','japanese'].includes(w)))].slice(0,10);
 const anchor=row.watch_category==='delta_reign'?['delta','reign']:row.watch_category==='30th_celebration'?['30th']:['hobbit','collector'];
 if(!anchor.every(w=>tokens.includes(w))||tokens.length<3)return null;
 return '^'+tokens.map(w=>'(?=.*\\b'+escape(w)+'\\b)').join('')+'.*$';
}
export function resolveScoutCatalog(rows:PublishedTarget[]){
 const targets:ScoutTarget[]=[],excluded:Array<{asin:string;reason:string}>=[];
 const ordered=[...rows].sort((a,b)=>Number(ITEMS.some(i=>i.asin===b.asin))-Number(ITEMS.some(i=>i.asin===a.asin))||a.approved_at.localeCompare(b.approved_at)||a.asin.localeCompare(b.asin));
 const seen=new Set<string>();
 for(const row of ordered){
  if(seen.has(row.asin))continue;seen.add(row.asin);
  let reason='';const base=ITEMS.find(i=>i.asin===row.asin);
  if(typeof row.product_name!=='string'||!row.product_name.trim()||row.product_name.length>300||!/^[A-Z0-9]{10}$/.test(row.asin)||row.product_url!=='https://www.amazon.com.mx/dp/'+row.asin||!Number.isFinite(Date.parse(row.approved_at)))reason='identity_or_approval_invalid';
  else if(row.language!=='english')reason='language_review_required';
  else if(!routes[row.watch_category]||base&&base.category!==row.watch_category)reason='outside_approved_scope';
  const pattern=reason?null:base?.titlePattern||reviewed[row.asin]||generatedPattern(row);
  if(!reason&&!pattern)reason='title_identity_review_required';
  if(!reason&&targets.length>=SCOUT_TARGET_CAP)reason='capacity_review_required';
  if(reason){excluded.push({asin:row.asin,reason});continue;}
  targets.push(base||{asin:row.asin,name:row.product_name.slice(0,160),url:row.product_url,titlePattern:pattern!,category:row.watch_category,routingKey:routes[row.watch_category]});
 }
 return {targets,excluded};
}
export async function scoutCatalog(env:Env){
 if(env.SCOUT_DYNAMIC_TARGETS_ENABLED!=='true')return {targets:ITEMS as ScoutTarget[],excluded:[],version:null as string|null};
 const rows=(await env.SPAWN_DB.prepare("SELECT asin,product_name,product_url,watch_category,language,approved_at FROM amazon_watchlist WHERE lifecycle_status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM inventory_admin_reviews r JOIN inventory i ON i.listing_key=r.listing_key WHERE i.canonical_url=amazon_watchlist.product_url AND r.removed_at IS NOT NULL) ORDER BY approved_at,asin LIMIT 201").all<PublishedTarget>()).results;
 if(rows.length>200)throw Error('Published catalog exceeds bounded review limit');
 const catalog=resolveScoutCatalog(rows);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(catalog.targets)));
 return {...catalog,version:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')};
}
export async function scoutTargets(env:Env){return (await scoutCatalog(env)).targets;}
