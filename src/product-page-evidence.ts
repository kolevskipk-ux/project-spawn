export type PageEvidence = {outcome:'AVAILABLE'|'SOLD_OUT'|'UNKNOWN'|'BLOCKED'|'ERROR';priceMxn:number|null;evidence:string};
const unknown=(evidence:string):PageEvidence=>({outcome:'UNKNOWN',priceMxn:null,evidence});
const words=(value:string)=>new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]{3,}/g)??[]);
function samePage(a:string,b:string){try{const x=new URL(a,b),y=new URL(b);return x.protocol==='https:'&&x.hostname===y.hostname&&x.pathname.replace(/\/$/,'')===y.pathname.replace(/\/$/,'')&&x.search===y.search;}catch{return false;}}

// Only exact-page structured Product offers are accepted. Cart text, related
// products, shipping thresholds and page-wide dollar amounts are not evidence.
export function assessProductEvidence(status:number,html:string,url:string,title:string,sku?:string|null):PageEvidence {
 if(status===403||status===429||/<title>[^<]*(?:robot check|captcha|access denied)|automated access to|verifica que eres humano|verify you are human/i.test(html))return {outcome:'BLOCKED',priceMxn:null,evidence:`access_blocked_http_${status}`};
 if(status!==200)return {outcome:'ERROR',priceMxn:null,evidence:`http_${status}`};
 const nodes:Record<string,unknown>[]=[];
 const visit=(value:unknown)=>{if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;const node=value as Record<string,unknown>;nodes.push(node);if(node['@graph'])visit(node['@graph']);if(node.mainEntity)visit(node.mainEntity);};
 for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(match[1]));}catch{/* Malformed structured data grants no evidence. */}}
 const products=nodes.filter(n=>(Array.isArray(n['@type'])?n['@type']:[n['@type']]).some(t=>t==='Product'||t==='https://schema.org/Product'));
 const matching=products.filter(p=>[p.url,p['@id']].some(v=>typeof v==='string'&&samePage(v.split('#')[0],url)));
 if(matching.length!==1)return unknown('exact_product_schema_not_found');
 const product=matching[0],expected=words(title),actual=words(String(product.name??''));
 const overlap=[...expected].filter(w=>actual.has(w)).length/Math.max(1,expected.size);
 if(!(sku&&String(product.sku??'')===sku)&&overlap<0.6)return unknown('product_identity_mismatch');
 const offers=(Array.isArray(product.offers)?product.offers:[product.offers]).filter(o=>o&&typeof o==='object') as Record<string,unknown>[];
 if(!offers.length||offers.length>50)return unknown('offers_missing_or_ambiguous');
 const observations=offers.map(offer=>{
  const offerType=String(offer['@type']??'');if(offerType==='AggregateOffer'||offerType==='https://schema.org/AggregateOffer')return null;
  if(offer.url&&(!samePage(String(offer.url),url)))return null;
  const availability=String(offer.availability??'').split('/').at(-1),amount=String(offer.price??'');
  if(!['InStock','OutOfStock','SoldOut'].includes(availability??''))return null;
  const price=String(offer.priceCurrency??'').toUpperCase()==='MXN'&&/^\d+(\.\d{1,2})?$/.test(amount)&&Number(amount)>0?Number(amount):null;
  return {outcome:availability==='InStock'?'AVAILABLE' as const:'SOLD_OUT' as const,priceMxn:price};
 });
 if(observations.some(o=>!o))return unknown('offer_not_attributable');
 const first=observations[0]!;
 if(observations.some(o=>o!.outcome!==first.outcome||o!.priceMxn!==first.priceMxn))return unknown('variant_offers_conflict');
 return {...first,evidence:JSON.stringify({parser:'exact-product-jsonld-v1',product:String(product.name),sku:product.sku??null,availability:first.outcome,currency:first.priceMxn===null?null:'MXN',price:first.priceMxn})};
}
