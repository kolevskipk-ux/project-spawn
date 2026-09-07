// Canonical source: project-spawn/src/contracts/amazon-catalog.mjs.
// Vendored into Catch; scripts/baseline-check.mjs rejects drift.
export const AMAZON_CATALOG_SCHEMA_VERSION = 2;
export const AMAZON_ROUTING_KEYS = new Set(["pokemon-main","pokemon-30th","delta-reign","magic-hobbit"]);
export const PRODUCT_LANGUAGES = ["english","spanish","bilingual","japanese","chinese","korean","french","german","italian","portuguese","other","unknown"];
export function catalogLanguageAllowed(language, version=2) { return version===1 ? language==="english" : PRODUCT_LANGUAGES.includes(language); }
export function languageLabel(language) { return !language || language==="unknown" ? "Language unconfirmed" : language==="other" ? "Other language (see evidence)" : language.charAt(0).toUpperCase()+language.slice(1); }
export function catalogRoute(category) { return category==="30th_celebration"?"pokemon-30th":category==="delta_reign"?"delta-reign":category==="mtg_hobbit_collector_box"?"magic-hobbit":"pokemon-main"; }

export function validatePublishedAmazonCatalog(payload) {
  if (!payload || ![1,2].includes(payload.schema_version) || !/^[1-9]\d*$/.test(String(payload.catalog_version || "")) || !Array.isArray(payload.watchlist) || !payload.watchlist.length || payload.watchlist.length > 200) return null;
  const seen = new Set(), canonicalIds = new Set(), normalized = [];
  for (const item of payload.watchlist) {
    if(!item || typeof item!=="object") return null;
    const asin = String(item.asin || "").toUpperCase();
    const canonicalId = String(item.canonical_product_id || "");
    const expectedRoute = catalogRoute(item.watch_category);
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin) || !/^[a-z0-9][a-z0-9-]{2,119}$/.test(canonicalId) || canonicalIds.has(canonicalId) || !String(item.product_name || "").trim() || !catalogLanguageAllowed(item.language,payload.schema_version) || !["priority","normal"].includes(item.lane) || ![5,60].includes(Number(item.poll_interval_minutes??5)) || !["BOSS","HIGH","NORMAL"].includes(item.priority) || !AMAZON_ROUTING_KEYS.has(item.routing_key) || item.routing_key !== expectedRoute || ![0,1,false,true].includes(item.alert_on_initial_buyable) || !item.approved_by || !item.approved_at) return null;
    let parsed; try { parsed = new URL(item.product_url); } catch { return null; }
    if (parsed.protocol !== "https:" || parsed.hostname !== "www.amazon.com.mx" || !new RegExp(`^/dp/${asin}(?:/|$)`,"i").test(parsed.pathname)) return null;
    seen.add(asin); canonicalIds.add(canonicalId); normalized.push({ ...item, asin, canonical_product_id:canonicalId, poll_interval_minutes:Number(item.poll_interval_minutes??5), alert_on_initial_buyable:Boolean(item.alert_on_initial_buyable) });
  }
  return normalized;
}

export function validateStagedAmazonCatalog(payload){
  if(!payload||![1,2].includes(payload.schema_version)||!Array.isArray(payload.watchlist)||payload.watchlist.length>10)return null;
  const seen=new Set(),out=[];
  for(const item of payload.watchlist){
    if(!item || typeof item!=="object") return null;
    const asin=String(item.asin||"").toUpperCase(),expectedRoute=item.watch_category==="30th_celebration"?"pokemon-30th":item.watch_category==="delta_reign"?"delta-reign":null;
    let parsed;try{parsed=new URL(item.product_url);}catch{return null;}
    if(!/^[A-Z0-9]{10}$/.test(asin)||seen.has(asin)||!String(item.canonical_product_id||"")||!catalogLanguageAllowed(item.language,payload.schema_version)||!expectedRoute||item.routing_key!==expectedRoute||parsed.protocol!=="https:"||parsed.hostname!=="www.amazon.com.mx"||!parsed.pathname.toUpperCase().includes(`/DP/${asin}`))return null;
    seen.add(asin);out.push({...item,asin,poll_interval_minutes:60,alert_on_initial_buyable:false,silent:true});
  }
  return out;
}

