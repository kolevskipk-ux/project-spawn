import type {Listing} from './types';
import {canonicalizeUrl} from './inventory';
import {assessProductEvidence} from './product-page-evidence';

export const STORE_CATEGORIES = ['30th_celebration','ascended_heroes','delta_reign','mtg_hobbit_collector_box','pokemon_tcg','mtg_tcg'] as const;
export const STORE_POLICY = {version:1,scope:'all-supported-sets',catalogHours:6,cadenceMinutes:{hot:5,warm:30,regular:60},hunts:{ascended_heroes:{priority:'warm',route:'ascended-heroes'}},newInventory:{hot:'immediate',warm:'daily',regular:'daily'}} as const;
export function catalogOrigin(value:string):string|null {
  try {
    const url=new URL(value),host=url.hostname;
    if(url.protocol!=='https:'||url.username||url.password||url.port||
      !/^[a-z][a-z0-9.-]+\.[a-z]{2,}$/i.test(host)||/(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host))return null;
    return url.origin;
  } catch {return null;}
}
export function marketplaceOrigin(origin:string) {
  return /(^|\.)(amazon|mercadolibre|walmart|liverpool|ebay|aliexpress|temu)\.[a-z.]+$/.test(new URL(origin).hostname);
}
export function catalogUrl(value:string,origin:string):string|null {
  try {const url=new URL(value,origin);url.pathname=url.pathname.replace(/^\/(?:en\/)?collections\/[^/]+\/products\//,'/products/');return catalogOrigin(url.href)===origin&&url.href.length<=1800?canonicalizeUrl(url.href):null;}catch{return null;}
}
export function catalogCategory(title:string):Listing['watch_category']|null {
  const text=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/single card|\bsingles\b|playmat|sleeves|deck box|\bfunko\b|\bfigure\b(?! collection)|\bfigura\b(?! coleccion)/.test(text))return null;
  const matches:Listing['watch_category'][]=[];
  if(/\b30(?:th)?\b/.test(text)&&/celebration|anniversary|aniversario/.test(text))matches.push('30th_celebration');
  if(/\bascended heroes\b/.test(text))matches.push('ascended_heroes');
  if(/\bdelta reign\b/.test(text))matches.push('delta_reign');
  if(/\bhobbit\b/.test(text)&&/collector booster/.test(text)&&/\bbox\b|\bdisplay\b/.test(text)&&!/sample|single|\bpack\b/.test(text))matches.push('mtg_hobbit_collector_box');
  if(matches.length===1)return matches[0];
  if(matches.length)return null;
  if(/single card|\bsingles\b|playmat|sleeves|deck box|\bfunko\b|\bfigure\b(?! collection)|\bfigura\b(?! coleccion)/.test(text))return null;
  const sealed=/booster|bundle|elite trainer|\betb\b|blister|collection|coleccion|\btin\b|\blata\b|\bdisplay\b|\bdeck\b|\bmazo\b|\bpack\b|\bsobre\b|\bcaja\b|\bbox\b/.test(text);
  if(sealed&&/\bpokemon\b/.test(text))return 'pokemon_tcg';
  if(sealed&&/\bmtg\b|magic(?: the gathering|: the gathering)/.test(text))return 'mtg_tcg';
  return null;
}
export function candidateCatalogUrl(url:string) {
  // Discover every product URL; identify scope from product evidence, not a hunt-name URL filter.
  return !/\/(cart|checkout|account|search)(\/|$)/.test(new URL(url).pathname);
}
const decode=(text:string)=>text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
export function sitemapLinks(text:string,origin:string) {
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Unsupported sitemap declarations');
  return [...text.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map(m=>catalogUrl(decode(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').trim()),origin)).filter((v):v is string=>Boolean(v));
}
export type RobotsPolicy={disallow:string[];sitemaps:string[]};
export function parseRobots(text:string,origin:string):RobotsPolicy {
  const disallow:string[]=[],sitemaps:string[]=[];
  let applies=false,inRules=false;
  for(const line of text.split(/\r?\n/)) {
    const match=line.replace(/#.*$/,'').match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);if(!match)continue;
    const [,raw,value]=match,key=raw.toLowerCase();
    if(key==='user-agent'){if(inRules){applies=false;inRules=false;}applies ||= value==='*'||/garfield/i.test(value);}
    else if(key==='sitemap'){const url=catalogUrl(value,origin);if(url)sitemaps.push(url);}
    else {inRules=true;if(applies&&key==='disallow'&&value)disallow.push(value);}
  }
  return {disallow,sitemaps};
}
export function robotsAllows(policy:RobotsPolicy,url:string) {
  const target=new URL(url).pathname+new URL(url).search;
  // Conservatively retain disallows even where a more specific Allow exists.
  return !policy.disallow.some(rule=>new RegExp('^'+rule.split('*').map(p=>p.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*').replace(/\\\$$/,'$')).test(target));
}
export function catalogProduct(html:string,url:string,retailer:string):{title:string;category:Listing['watch_category']|null;listing:Listing|null;note:string}|null {
  const nodes:Record<string,any>[]=[];
  const visit=(value:any,depth=0)=>{if(depth>8)return;if(Array.isArray(value)){value.forEach(v=>visit(v,depth+1));return;}if(!value||typeof value!=='object')return;nodes.push(value);if(value['@graph'])visit(value['@graph'],depth+1);if(value.mainEntity)visit(value.mainEntity,depth+1);};
  for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{visit(JSON.parse(m[1]));}catch{}
  const products=nodes.filter(p=>[p['@type']].flat().some(t=>t==='Product'||t==='https://schema.org/Product')&&[p.url,p['@id']].some(v=>typeof v==='string'&&catalogUrl(v,new URL(url).origin)===canonicalizeUrl(url)));
  if(products.length!==1||typeof products[0].name!=='string')return null;
  const product=products[0],title=product.name.slice(0,500),category=catalogCategory(title+' '+String(product.brand?.name??product.brand??'')+' '+String(product.category??''));
  const proof=assessProductEvidence(200,html,url,title,product.sku?String(product.sku):null);
  const offers=[product.offers].flat(),preorder=offers.length===1&&offers[0]?.['@type']!=='AggregateOffer'&&
    (!offers[0]?.url||catalogUrl(String(offers[0].url),new URL(url).origin)===url)&&/\/(PreOrder|PreSale)$/.test(String(offers[0]?.availability));
  if(proof.outcome==='BLOCKED'||proof.outcome==='ERROR')return {title,category,listing:null,note:proof.evidence};
  // Ambiguous variants remain visible for review rather than becoming stock evidence.
  const supported=['AVAILABLE','SOLD_OUT'].includes(proof.outcome)||preorder;
  if(!category||!supported)return {title,category,listing:null,note:category?proof.evidence:'Outside supported sealed Pokémon and Magic inventory'};
  const language:Listing['language']=/\b(english|ingles)\b/i.test(title)?'english':/\b(spanish|espa[nñ]ol)\b/i.test(title)?'spanish':'unknown';
  const listing:Listing={title,watch_category:category,retailer,retailer_sku:product.sku?String(product.sku).slice(0,200):null,url,
    status:proof.outcome==='AVAILABLE'?'available':proof.outcome==='SOLD_OUT'?'sold_out':'unknown',
    availability_state:preorder?'preorder_placeholder':proof.outcome==='AVAILABLE'?'available':'sold_out',
    price_mxn:preorder?null:proof.priceMxn,language,language_evidence:language==='unknown'?'Language not established':title,
    msrp_mxn:null,msrp_source_url:null,evidence:preorder?'Exact product JSON-LD preorder; buyability and price unconfirmed':proof.evidence};
  return {title,category,listing,note:listing.evidence};
}
