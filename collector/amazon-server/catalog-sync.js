import {ITEMS as BASE_ITEMS} from './base-items.js';
import {AMAZON_COLLECTOR_TOKEN} from './private-config.js';
export let ITEMS=BASE_ITEMS;
let expiresAt=Date.now()+300000,lastAttempt=0,loading=null,inflight=null;
export function validCatalog(c,now=Date.now(),cached=false){
 if(!c||c.schemaVersion!==1||c.maxTargets!==20||!Array.isArray(c.items)||c.items.length>20||!(c.version===null||typeof c.version==='string'&&/^[a-f0-9]{64}$/.test(c.version)))return false;
 const generated=Date.parse(c.generatedAt),expiry=Date.parse(c.expiresAt);
 if(!Number.isFinite(generated)||!Number.isFinite(expiry)||generated>now+60000||(!cached&&generated<now-300000)||expiry<=now||expiry>generated+1800000||expiry>now+1860000)return false;
 const seen=new Set(),routes={'30th_celebration':'pokemon-30th','delta_reign':'delta-reign','mtg_hobbit_collector_box':'magic-hobbit'};
 for(const i of c.items){
  if(!i||typeof i.asin!=='string'||!/^[A-Z0-9]{10}$/.test(i.asin)||seen.has(i.asin)||i.url!=='https://www.amazon.com.mx/dp/'+i.asin||typeof i.name!=='string'||!i.name||i.name.length>160||typeof i.titlePattern!=='string'||!i.titlePattern||i.titlePattern.length>500||routes[i.category]!==i.routingKey)return false;
  const base=BASE_ITEMS.find(b=>b.asin===i.asin);
  const baseCategory=base?.category||(['B0HG3MQDWP','B0HG3RVZLW'].includes(i.asin)?'delta_reign':'30th_celebration');
  if(base&&(base.titlePattern!==i.titlePattern||baseCategory!==i.category||routes[baseCategory]!==i.routingKey))return false;
  try{new RegExp(i.titlePattern,'i');}catch{return false;}
  seen.add(i.asin);
 }
 return true;
}
async function load(){
 if(!loading)loading=(async()=>{
  const {collectorCatalog}=await browser.storage.local.get('collectorCatalog');
  if(collectorCatalog){
   // Never grant a new grace period to an expired or invalid retained catalog.
   expiresAt=0;
   if(validCatalog(collectorCatalog,Date.now(),true)){ITEMS=collectorCatalog.items;expiresAt=Date.parse(collectorCatalog.expiresAt);}
  }
 })();
 return loading;
}
export async function ensureCatalog(){
 await load();
 if(inflight){await inflight;return expiresAt>Date.now()&&ITEMS.length>0;}
 if(Date.now()-lastAttempt>=300000){
  if(!inflight)inflight=(async()=>{
   lastAttempt=Date.now();
   try{
    const r=await fetch('https://spawn.aztlan-eng.com/internal/amazon-browser/targets',{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+AMAZON_COLLECTOR_TOKEN,accept:'application/json'}});
    if(!r.ok){await r.body?.cancel();return;}
    const text=await r.text();if(text.length>24000)return;const c=JSON.parse(text);
    if(!validCatalog(c))return;
    const clean={schemaVersion:1,maxTargets:20,version:c.version,generatedAt:c.generatedAt,expiresAt:c.expiresAt,items:c.items.map(({asin,name,url,titlePattern,category,routingKey})=>({asin,name,url,titlePattern,category,routingKey}))};
    await browser.storage.local.set({collectorCatalog:clean});ITEMS=clean.items;expiresAt=Date.parse(clean.expiresAt);
   }catch{/* Keep only a still-valid last-known catalog; never clear pauses or baselines. */}
  })().finally(()=>{inflight=null;});
  await inflight;
 }
 return expiresAt>Date.now()&&ITEMS.length>0;
}
