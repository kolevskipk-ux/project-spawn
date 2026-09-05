export const FULFILMENT_STATES=["DOMESTIC","CROSS_BORDER_CONFIRMED","CROSS_BORDER_UNVERIFIED","DESTINATION_UNAVAILABLE"] as const;
export const IMPORT_COST_STATES=["INCLUDED","EXCLUDED","UNKNOWN"] as const;
export type FulfilmentState=typeof FULFILMENT_STATES[number];

const iso=(value:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const country=(value:string)=>/^[A-Z]{2}$/.test(value.toUpperCase())?value.toUpperCase():null;
const currency=(value:string)=>/^[A-Z]{3}$/.test(value.toUpperCase())?value.toUpperCase():null;
const money=(value:string)=>value===""?null:Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1_000_000?Number(value):undefined;

export function validateFulfilmentReview(form:FormData,now=Date.now()){
  const state=String(form.get("fulfilment_region_state")||"") as FulfilmentState,retailerCountry=country(String(form.get("retailer_country")||"")),shipFromCountry=country(String(form.get("ship_from_country")||""));
  const originalCurrency=currency(String(form.get("original_currency")||"")),originalPrice=money(String(form.get("original_price")||"")),shippingMxn=money(String(form.get("shipping_mxn")||""));
  const importCostStatus=String(form.get("import_cost_status")||"UNKNOWN"),checkedAt=iso(String(form.get("destination_checked_at")||"")),freshUntil=iso(String(form.get("destination_fresh_until")||""));
  if(!FULFILMENT_STATES.includes(state)||!IMPORT_COST_STATES.includes(importCostStatus as never)||originalPrice===undefined||shippingMxn===undefined)return {ok:false as const,error:"invalid_fulfilment_evidence"};
  if(state==="DOMESTIC"&&(!retailerCountry||!shipFromCountry||retailerCountry!=="MX"||shipFromCountry!=="MX"))return {ok:false as const,error:"domestic_requires_mexico_evidence"};
  if(state==="CROSS_BORDER_CONFIRMED") {
    if(!retailerCountry||!shipFromCountry||shipFromCountry==="MX")return {ok:false as const,error:"cross_border_requires_country"};
    if(originalPrice==null)return {ok:false as const,error:"cross_border_requires_price"};
    if(!originalCurrency)return {ok:false as const,error:"cross_border_requires_currency"};
    if(!checkedAt||!freshUntil)return {ok:false as const,error:"cross_border_requires_dates"};
    if(Date.parse(freshUntil)<=now)return {ok:false as const,error:"cross_border_evidence_expired"};
  }
  if(!["DOMESTIC","CROSS_BORDER_CONFIRMED"].includes(state))return {ok:false as const,error:"fulfilment_not_publishable"};
  return {ok:true as const,value:{state,retailerCountry,shipFromCountry,originalCurrency,originalPrice,shippingMxn,importCostStatus,checkedAt,freshUntil,mexicoDeliveryStatus:"CONFIRMED" as const}};
}
