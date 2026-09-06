import {customerInventoryStatements} from './customer-feed-query';
import {compareReferences,type ReferenceProduct,type ReferenceResult} from './reference-comparison';
export interface FeedEnv { SPAWN_DB: D1Database }
export interface CustomerListing {id:string;title:string;set_name:string;retailer:string;language:string;price_mxn:number|null;availability:string;observed_at:string;references?:ReferenceResult[]}
export interface CustomerInventoryPage {rows:CustomerListing[];facets:{set_name:string;retailer:string}[]}

// This Worker has no public routes. Only the customer Worker's service binding
// can call it. Do not replace the projection with inventory.* or an admin feed.
export async function customerInventory(env:FeedEnv,url:URL,now=new Date()):Promise<CustomerInventoryPage> {
 const result=await env.SPAWN_DB.batch(customerInventoryStatements(env.SPAWN_DB,url,now));
 const rows=result[0].results.map(raw=>{
   const r=raw as unknown as CustomerListing & {_availability_state:string;_product_id:string|null;_category:string;_fulfilment:string;_price_at:string|null;_reference:string};
   const reference=JSON.parse(r._reference) as ReferenceProduct;
   const check=compareReferences({title:r.title,watch_category:r._category,language:r.language,product_id:r._product_id,price_mxn:r.price_mxn,availability_state:r._availability_state,price_verification_status:r.price_mxn!=null?'VERIFIED':'PENDING',pricing_observed_at:r._price_at,fulfilment_region_state:r._fulfilment},reference.id?reference:null,now);
   const references=['Product mapping missing','Product identity mismatch','Variant match needs review'].includes(check.offerStatus)?[]:check.references.filter(ref=>ref.referenceMxn!=null&&ref.status!=='Reference match needs review');
   // Explicit customer allowlist: never send internal catalog fields or audit data.
   return {id:r.id,title:r.title,set_name:r.set_name,retailer:r.retailer,language:r.language,price_mxn:r.price_mxn,availability:r.availability,observed_at:r.observed_at,references};
 });
 return {rows,facets:result[1].results as unknown as CustomerInventoryPage['facets']};
}

export default {async fetch(request:Request,env:FeedEnv):Promise<Response>{
 const url=new URL(request.url);
 if(url.pathname!='/inventory')return new Response('Not found',{status:404});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{return Response.json(await customerInventory(env,url),{headers:{'cache-control':'no-store'}});}
 catch{return Response.json({error:'inventory_unavailable'},{status:503,headers:{'cache-control':'no-store'}});}
}};
