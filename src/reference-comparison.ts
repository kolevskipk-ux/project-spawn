import {catalogProductId} from './catalog';
export interface ReferenceProduct {
 id:string;canonical_name:string;watch_category:string;language:string;
 amazon_launch_mxn:number|null;amazon_source_url:string|null;amazon_captured_at:string|null;amazon_confidence:string|null;
 collectr_usd:number|null;collectr_source_url:string|null;collectr_captured_at:string|null;usd_mxn_rate:number|null;
}
export interface ComparisonOffer {
 title:string;watch_category:string;language:string;product_id?:string|null;price_mxn:number|null;
 price_verification_status?:string|null;pricing_observed_at?:string|null;availability_state?:string;
 fulfilment_region_state?:string|null;revalidation_state?:string|null;
}
export interface ReferenceResult {source:'Amazon México'|'Collectr';status:string;referenceMxn:number|null;deltaPercent:number|null;capturedAt:string|null;sourceUrl:string|null;note:string}
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function trustedUrl(value:string|null,kind:'amazon'|'collectr') {
 try {const u=new URL(value??'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(kind==='amazon'?/(^|\.)amazon\.com\.mx$/.test(u.hostname):/(^|\.)(getcollectr|collectr)\.com$/.test(u.hostname))?u.href:null;}catch{return null;}
}
export function compareReferences(offer:ComparisonOffer,product:ReferenceProduct|null|undefined,now=new Date()):{offerStatus:string;references:ReferenceResult[]} {
 let offerStatus='Ready';
 if(!offer.product_id||!product)offerStatus='Product mapping missing';
 else if(product.id!==offer.product_id||product.language!==offer.language||product.watch_category!==offer.watch_category||offer.language==='unknown')offerStatus='Product identity mismatch';
 else if(fold(offer.title)!==fold(product.canonical_name)&&(/pokemon center|\b(case|lot|exclusive|deluxe|opened|empty)\b/.test(fold(offer.title))||/\d+\s*[x×]|(?:pack|set) of \d/i.test(offer.title)||catalogProductId(offer as Parameters<typeof catalogProductId>[0])!==product.id))offerStatus='Variant match needs review';
 else if(offer.availability_state==='preorder_placeholder')offerStatus='Placeholder price';
 else if(!positive(offer.price_mxn))offerStatus='Offer price missing';
 else if(offer.price_verification_status!=='VERIFIED')offerStatus='Offer price unverified';
 else {
   const at=Date.parse(offer.pricing_observed_at??'');
   if(!Number.isFinite(at)||at>now.getTime()||now.getTime()-at>86400000)offerStatus='Offer price stale or undated';
 }
 const references:ReferenceResult[]=(['amazon','collectr'] as const).map(kind=>{
   const amount=kind==='amazon'?product?.amazon_launch_mxn:product?.collectr_usd;
   const capturedAt=(kind==='amazon'?product?.amazon_captured_at:product?.collectr_captured_at)??null;
   const sourceUrl=trustedUrl((kind==='amazon'?product?.amazon_source_url:product?.collectr_source_url)??null,kind);
   const result:ReferenceResult={source:kind==='amazon'?'Amazon México':'Collectr',status:'Reference missing',referenceMxn:null,deltaPercent:null,capturedAt,sourceUrl,note:''};
   if(amount==null)return result;
   if(!positive(amount)||!sourceUrl||!Number.isFinite(Date.parse(capturedAt??''))||Date.parse(capturedAt!)>now.getTime()){result.status='Reference evidence incomplete';return result;}
   if(kind==='collectr'&&(!positive(product?.usd_mxn_rate)||product!.usd_mxn_rate!<1||product!.usd_mxn_rate!>100)){result.status='USD/MXN rate missing or invalid';return result;}
   result.referenceMxn=Math.round(amount*(kind==='collectr'?product!.usd_mxn_rate!:1)*100)/100;
   if(!positive(result.referenceMxn)){result.referenceMxn=null;result.status='Reference evidence incomplete';return result;}
   result.note=kind==='amazon'?`Historical observed price · ${product?.amazon_confidence??'match confidence missing'}; not verified MSRP`:`Historical market estimate · USD ${amount} × ${product!.usd_mxn_rate} MXN/USD; exchange-rate date not recorded`;
   if(kind==='amazon'&&product?.amazon_confidence!=='exact'){result.status='Reference match needs review';return result;}
   result.status=offerStatus;
   if(offerStatus==='Ready'){
     result.deltaPercent=Math.round((offer.price_mxn!/result.referenceMxn-1)*1000)/10;
     result.status='Historical comparison';
     if(offer.fulfilment_region_state==='CROSS_BORDER_CONFIRMED')result.note+=' · Item price only; delivery/import costs excluded';
   }
   return result;
 });
 return {offerStatus,references};
}
