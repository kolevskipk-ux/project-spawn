import type { Env } from "./types";

export interface PricingReferenceInput {
  amazonLaunchMxn?:number;
  amazonConfidence?:"exact"|"strong_proxy"|"estimated_range";
  amazonSourceUrl?:string;
  amazonCapturedAt?:string;
  collectrUsd?:number;
  collectrSourceUrl?:string;
  collectrCapturedAt?:string;
  usdMxnRate?:number;
  reason:string;
}

const finite=(value:FormDataEntryValue|null,min:number,max:number)=>{if(value==null||String(value).trim()==="")return undefined;const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null;};
const timestamp=(value:FormDataEntryValue|null,now:number)=>{if(value==null||String(value).trim()==="")return undefined;const parsed=Date.parse(String(value));return Number.isFinite(parsed)&&parsed<=now+300_000?new Date(parsed).toISOString():null;};
const sourceUrl=(value:FormDataEntryValue|null,kind:"amazon"|"collectr")=>{if(value==null||String(value).trim()==="")return undefined;try{const url=new URL(String(value));const host=url.hostname.toLowerCase();if(url.protocol!=="https:"||url.username||url.password)return null;if(kind==="amazon"&&!/(^|\.)amazon\.com\.mx$/.test(host))return null;if(kind==="collectr"&&!/(^|\.)(?:collectr|getcollectr)\.com$/.test(host))return null;return url.toString();}catch{return null;}};

export function validatePricingReferenceForm(form:FormData,now=Date.now()):{ok:true;value:PricingReferenceInput}|{ok:false;error:string}{
  const reason=String(form.get("reason")||"").trim().slice(0,500);if(!reason)return {ok:false,error:"reason_required"};
  const amazonLaunchMxn=finite(form.get("amazon_launch_mxn"),1,1_000_000),amazonConfidence=String(form.get("amazon_confidence")||"")||undefined,amazonSourceUrl=sourceUrl(form.get("amazon_source_url"),"amazon"),amazonCapturedAt=timestamp(form.get("amazon_captured_at"),now);
  const collectrUsd=finite(form.get("collectr_usd"),0.01,100_000),collectrSourceUrl=sourceUrl(form.get("collectr_source_url"),"collectr"),collectrCapturedAt=timestamp(form.get("collectr_captured_at"),now),usdMxnRate=finite(form.get("usd_mxn_rate"),1,100);
  if([amazonLaunchMxn,amazonSourceUrl,amazonCapturedAt,collectrUsd,collectrSourceUrl,collectrCapturedAt,usdMxnRate].includes(null))return {ok:false,error:"invalid_reference_value"};
  const hasAmazon=amazonLaunchMxn!==undefined||amazonConfidence!==undefined||amazonSourceUrl!==undefined||amazonCapturedAt!==undefined,hasCollectr=collectrUsd!==undefined||collectrSourceUrl!==undefined||collectrCapturedAt!==undefined||usdMxnRate!==undefined;
  if(!hasAmazon&&!hasCollectr)return {ok:false,error:"reference_required"};
  if(hasAmazon&&(amazonLaunchMxn===undefined||!["exact","strong_proxy","estimated_range"].includes(String(amazonConfidence))||amazonSourceUrl===undefined||amazonCapturedAt===undefined))return {ok:false,error:"amazon_reference_incomplete"};
  if(hasCollectr&&(collectrUsd===undefined||collectrSourceUrl===undefined||collectrCapturedAt===undefined||usdMxnRate===undefined))return {ok:false,error:"collectr_reference_incomplete"};
  return {ok:true,value:{amazonLaunchMxn:amazonLaunchMxn as number|undefined,amazonConfidence:amazonConfidence as PricingReferenceInput["amazonConfidence"],amazonSourceUrl:amazonSourceUrl as string|undefined,amazonCapturedAt:amazonCapturedAt as string|undefined,collectrUsd:collectrUsd as number|undefined,collectrSourceUrl:collectrSourceUrl as string|undefined,collectrCapturedAt:collectrCapturedAt as string|undefined,usdMxnRate:usdMxnRate as number|undefined,reason}};
}

export async function updatePricingReferences(env:Env,productId:string,input:PricingReferenceInput,actor:string){
  if(!/^[a-z0-9][a-z0-9-]{2,119}$/.test(productId))return {ok:false as const,error:"invalid_product_id"};
  const prior=await env.SPAWN_DB.prepare("SELECT * FROM products WHERE id=?").bind(productId).first<Record<string,unknown>>();if(!prior)return {ok:false as const,error:"product_not_found"};
  const resulting={...prior,
    amazon_launch_mxn:input.amazonLaunchMxn??prior.amazon_launch_mxn,amazon_confidence:input.amazonConfidence??prior.amazon_confidence,amazon_source_url:input.amazonSourceUrl??prior.amazon_source_url,amazon_captured_at:input.amazonCapturedAt??prior.amazon_captured_at,
    collectr_usd:input.collectrUsd??prior.collectr_usd,collectr_source_url:input.collectrSourceUrl??prior.collectr_source_url,collectr_captured_at:input.collectrCapturedAt??prior.collectr_captured_at,usd_mxn_rate:input.usdMxnRate??prior.usd_mxn_rate};
  const now=new Date().toISOString();
  await env.SPAWN_DB.batch([
    env.SPAWN_DB.prepare("UPDATE products SET amazon_launch_mxn=?,amazon_confidence=?,amazon_source_url=?,amazon_captured_at=?,collectr_usd=?,collectr_source_url=?,collectr_captured_at=?,usd_mxn_rate=?,updated_at=? WHERE id=?").bind(resulting.amazon_launch_mxn,resulting.amazon_confidence,resulting.amazon_source_url,resulting.amazon_captured_at,resulting.collectr_usd,resulting.collectr_source_url,resulting.collectr_captured_at,resulting.usd_mxn_rate,now,productId),
    env.SPAWN_DB.prepare("INSERT INTO pricing_reference_decisions(product_id,prior_json,resulting_json,reason,decided_by,decided_at) VALUES(?,?,?,?,?,?)").bind(productId,JSON.stringify(prior),JSON.stringify(resulting),input.reason,actor,now)
  ]);
  return {ok:true as const,productId};
}
