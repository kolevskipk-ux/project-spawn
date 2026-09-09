import {categoryReference,type CategoryReference} from './category-reference';
import {PRODUCT_LANGUAGES,languageLabel} from "./contracts/amazon-catalog.mjs";
import type { Env } from "./types";
import { printSeries } from "./garfield";
import {compareReferences,type ReferenceProduct} from './reference-comparison';

export interface BoardRow {
  diagnostic_id?: string;
  category_reference?: CategoryReference|null;
  revalidation_last_attempt_at?:string|null;
  refresh_enabled?:boolean;
  product_id?:string|null;
  reference?:ReferenceProduct;
  listing_key: string;
  title: string;
  watch_category: string;
  print_series?: string;
  retailer: string;
  retailer_sku: string | null;
  language: string;
  price_mxn: number | null;
  seller?: string | null;
  fulfilled_by?: string | null;
  availability_evidence_type?: string | null;
  price_verification_status?: string | null;
  availability_freshness_status?: string | null;
  availability_observed_at?: string | null;
  pricing_observed_at?: string | null;
  status: string;
  availability_state?: string;
  last_change_type: string;
  first_seen_at: string;
  last_seen_at: string;
  canonical_url: string;
  amazon_launch_mxn: number | null;
  amazon_confidence: string | null;
  collectr_usd: number | null;
  usd_mxn_rate: number | null;
  value_classification?: string;
  revalidation_state?: string | null;
  revalidation_last_success_at?: string | null;
  revalidation_last_outcome?: string | null;
  revalidation_due_at?: string | null;
  fulfilment_region_state?: string | null;
  retailer_country?: string | null;
  ship_from_country?: string | null;
  original_price?: number | null;
  original_currency?: string | null;
  mexico_delivery_status?: string | null;
  shipping_mxn?: number | null;
  import_cost_status?: string | null;
  destination_checked_at?: string | null;
  destination_fresh_until?: string | null;
}

export interface CatchHuntRow {
  category_reference?:CategoryReference|null;
  language?:string;
  lastAttemptAt?:string|null;
  nextCheckAt?:string|null;
  buyingOptions?:{status?:string;checkedAt?:string;explicitlyEmpty?:boolean;lowestOffer?:{priceMxn:number;seller?:string;fulfilledBy?:string}}|null;
  diagnostic_id?: string;
  id: string;
  name: string;
  asin: string;
  url: string;
  cadenceClass: string;
  cadenceMinutes: number;
  persistedState: string | null;
  lastTrustworthyAt: string | null;
  overdue: boolean;
  overdueReason: string | null;
  lastCheck?: { observedState?: string; price?: string | null; seller?: string | null; fulfilledBy?: string | null } | null;
}

export interface CatchHuntSnapshot {
  catalog?:Record<string,unknown>;
  available: boolean;
  mode: string | null;
  degraded: boolean;
  rollout: string | null;
  rows: CatchHuntRow[];
  error?: string;
}

const BOARD_QUERY = `WITH ranked AS (
  SELECT i.*, d.diagnostic_id, p.amazon_launch_mxn, p.amazon_confidence, p.collectr_usd, p.usd_mxn_rate,
    r.last_attempt_at revalidation_last_attempt_at,r.lifecycle_state revalidation_state,r.last_success_at revalidation_last_success_at,r.last_outcome revalidation_last_outcome,r.due_at revalidation_due_at,
    ROW_NUMBER() OVER (
      PARTITION BY replace(replace(lower(i.retailer), 'é', 'e'), 'í', 'i'), COALESCE(i.retailer_sku, i.canonical_url)
      ORDER BY i.last_seen_at DESC, i.first_seen_at DESC
    ) AS offer_rank
  FROM inventory i
  LEFT JOIN inventory_diagnostic_ids d ON d.source='inventory' AND d.source_key=i.listing_key
  LEFT JOIN products p ON p.id = i.product_id
  LEFT JOIN inventory_revalidation_state r ON r.listing_key=i.listing_key
  WHERE i.fulfilment_region_state IN ('DOMESTIC','CROSS_BORDER_CONFIRMED')
    AND i.canonical_url NOT LIKE '%/collections/%'
    AND i.canonical_url NOT LIKE '%/content/%'
    AND i.canonical_url NOT LIKE '%/undefined%'
)
SELECT listing_key, diagnostic_id, product_id, title, print_series, watch_category, retailer, retailer_sku, language, price_mxn, seller, fulfilled_by, availability_evidence_type, price_verification_status, availability_freshness_status, availability_observed_at, pricing_observed_at, status, availability_state, last_change_type,
  first_seen_at, last_seen_at, canonical_url, amazon_launch_mxn, amazon_confidence, collectr_usd, usd_mxn_rate,revalidation_last_attempt_at,revalidation_state,revalidation_last_success_at,revalidation_last_outcome,revalidation_due_at,
  fulfilment_region_state,retailer_country,ship_from_country,original_price,original_currency,mexico_delivery_status,shipping_mxn,import_cost_status,destination_checked_at,destination_fresh_until
FROM ranked WHERE offer_rank = 1
ORDER BY CASE fulfilment_region_state WHEN 'DOMESTIC' THEN 0 WHEN 'CROSS_BORDER_CONFIRMED' THEN 1 ELSE 2 END, CASE status WHEN 'available' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END, last_seen_at DESC`;

export async function boardRows(env: Env): Promise<BoardRow[]> {
  const [offers,products,refs]=await Promise.all([env.SPAWN_DB.prepare(BOARD_QUERY).all<BoardRow>(),env.SPAWN_DB.prepare('SELECT * FROM products').all<ReferenceProduct>(),env.SPAWN_DB.prepare('SELECT * FROM category_price_references').all<CategoryReference>()]);
  const references=new Map(products.results.map(p=>[p.id,p]));
  return offers.results.map(row=>{const reference=references.get(row.product_id??'');return {...row,reference,refresh_enabled:env.INVENTORY_REVALIDATION_ENABLED==='true',category_reference:categoryReference(row.title,row.language,refs.results),value_classification:compareReferences(row,reference).offerStatus};});
}

export function referenceComparisonHtml(row:BoardRow,now=new Date()):string {
  const result=compareReferences(row,row.reference,now);
  return `<div class="reference-check"><p class="note"><strong>Reference check:</strong> ${escapeHtml(result.offerStatus==='Ready'?'Offer evidence checked':result.offerStatus)}</p>${result.references.map(r=>`<p class="note"><strong>${r.source}:</strong> ${r.deltaPercent==null?escapeHtml(r.status):`${r.deltaPercent>0?'+':''}${r.deltaPercent}% vs ${escapeHtml(money(r.referenceMxn))}`} ${r.referenceMxn!=null&&r.deltaPercent==null?`· reference ${escapeHtml(money(r.referenceMxn))}`:''}${r.sourceUrl?` · <a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>`:''}${r.capturedAt?` · observed ${escapeHtml(r.capturedAt)}`:''}${r.note?`<br>${escapeHtml(r.note)}`:''}</p>`).join('')}</div>`;
}

export async function catchHuntSnapshot(env: Env, fetchFn: typeof fetch = fetch): Promise<CatchHuntSnapshot> {
  if (!env.CATCH_MONITOR_ENDPOINT) return { available:false, mode:null, degraded:false, rollout:null, rows:[], error:"not_configured" };
  try {
    const response = await fetchFn(env.CATCH_MONITOR_ENDPOINT, { headers:{ accept:"application/json" }, signal:AbortSignal.timeout(10000) });
    if (!response.ok) return { available:false, mode:null, degraded:false, rollout:null, rows:[], error:`http_${response.status}` };
    const body = await response.json() as Record<string,unknown>;
    const identities = await env.SPAWN_DB.prepare("SELECT source_key,diagnostic_id FROM inventory_diagnostic_ids WHERE source='amazon'").all<{source_key:string;diagnostic_id:string}>();
    const refs=await env.SPAWN_DB.prepare('SELECT * FROM category_price_references').all<CategoryReference>();
    const diagnosticIds = new Map(identities.results.map(row=>[row.source_key,row.diagnostic_id]));
    const architecture = body.architecture && typeof body.architecture === "object" ? body.architecture as Record<string,unknown> : {};
    const health = body.health && typeof body.health === "object" ? body.health as Record<string,unknown> : {};
    const retailerAccess = health.retailerAccess && typeof health.retailerAccess === "object" ? health.retailerAccess as Record<string,unknown> : {};
    const amazon = retailerAccess.amazon && typeof retailerAccess.amazon === "object" ? retailerAccess.amazon as Record<string,unknown> : {};
    const rows = Array.isArray(body.rows) ? body.rows.filter((value): value is Record<string,unknown> => Boolean(value && typeof value === "object"))
      .filter(row => row.group === "amazon" && typeof row.asin === "string" && /^[A-Z0-9]{10}$/i.test(row.asin))
      .map(row => ({
        category_reference:categoryReference(String(row.name??""),String(row.language??"unknown"),refs.results),
        diagnostic_id:diagnosticIds.get(String(row.asin).toUpperCase()),
        language:String(row.language??'unknown'),lastAttemptAt:typeof row.lastAttemptAt==='string'?row.lastAttemptAt:null,nextCheckAt:typeof row.nextCheckAt==='string'?row.nextCheckAt:null,
        buyingOptions:row.buyingOptions&&typeof row.buyingOptions==='object'?row.buyingOptions as CatchHuntRow['buyingOptions']:null,
        id:String(row.id ?? ""), name:String(row.name ?? "Unknown Amazon product"), asin:String(row.asin).toUpperCase(),
        url:`https://www.amazon.com.mx/dp/${String(row.asin).toUpperCase()}`, cadenceClass:String(row.cadenceClass ?? "unassigned"),
        cadenceMinutes:Number(row.cadenceMinutes) || 0, persistedState:typeof row.persistedState === "string" ? row.persistedState : null,
        lastTrustworthyAt:typeof row.lastTrustworthyAt === "string" ? row.lastTrustworthyAt : null, overdue:row.overdue === true,
        overdueReason:typeof row.overdueReason === "string" ? row.overdueReason : null,
        lastCheck:row.lastCheck && typeof row.lastCheck === "object" ? row.lastCheck as CatchHuntRow["lastCheck"] : null
      })).sort((left,right) => left.name.localeCompare(right.name,"en")) : [];
    return { catalog:body.catalog&&typeof body.catalog==='object'?body.catalog as Record<string,unknown>:undefined, available:true, mode:typeof amazon.mode === "string" ? amazon.mode : null, degraded:amazon.degraded === true,
      rollout:typeof architecture.cadenceRolloutMode === "string" ? architecture.cadenceRolloutMode : null, rows };
  } catch { return { available:false, mode:null, degraded:false, rollout:null, rows:[], error:"unreachable" }; }
}

export function percentDifference(price: number | null, reference: number | null): number | null {
  if (price == null || reference == null || reference <= 0) return null;
  return Math.round(((price - reference) / reference) * 100);
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]!);

const label = (value: string) => ({
  "30th_celebration": "30th Celebration", ascended_heroes: "Ascended Heroes",
  english: "English", spanish: "Spanish", bilingual: "Bilingual", japanese: "Japanese", chinese: "Chinese", unknown: "Unconfirmed",
  available: "Available", sold_out: "Sold out", baseline: "Baseline", new: "New", restock: "Restock", price_drop: "Price drop", unchanged: "Unchanged"
})[value] ?? (PRODUCT_LANGUAGES.includes(value)?languageLabel(value):value);

const money = (value: number | null) => value == null ? "Price unavailable" : `$${Math.round(value).toLocaleString("en-US")} MXN`;

function freshness(lastSeen: string, now: Date): { text: string; stale: boolean } {
  const age=now.getTime()-Date.parse(lastSeen);
  if(!Number.isFinite(age)||age<0)return {text:"Verification date unconfirmed",stale:true};
  const hours = Math.floor(age / 3600000);
  if (hours < 1) return { text: "Verified less than 1 hour ago", stale: false };
  if (hours < 36) return { text: `Verified ${hours}h ago`, stale: false };
  const days = Math.floor(hours / 24);
  return { text: `Last verified ${days}d ago`, stale: true };
}

const catchStateLabel = (value: string | null) => ({ BUYABLE:"Available", BUYABLE_VIA_OPTIONS:"Available via Buying Options", NO_FEATURED_OFFER:"Buying Options unconfirmed", PREORDER_BUYABLE:"Preorder available", SOLD_OUT:"Sold out" })[value ?? ""] ?? "Unconfirmed";
const catchStateClass = (value: string | null) => value === "BUYABLE" || value === "BUYABLE_VIA_OPTIONS" || value === "PREORDER_BUYABLE" ? "available" : value === "SOLD_OUT" ? "sold_out" : "unknown";
const boardAsin = (row: BoardRow) => {
  const sku = String(row.retailer_sku ?? "").toUpperCase();
  if (/^[A-Z0-9]{10}$/.test(sku)) return sku;
  try { return new URL(row.canonical_url).pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() ?? null; } catch { return null; }
};

export function huntAvailability(row:CatchHuntRow,now=new Date()):string {
  const buying=row.buyingOptions,age=now.getTime()-Date.parse(buying?.checkedAt??''),fresh=Number.isFinite(age)&&age>=0&&age<=6*3600000;
  if(fresh&&buying?.status==='OK'&&Number.isFinite(buying.lowestOffer?.priceMxn)&&buying.lowestOffer!.priceMxn>0)return 'BUYABLE_VIA_OPTIONS';
  if(fresh&&buying?.status==='OK'&&buying.explicitlyEmpty)return 'SOLD_OUT';
  if(!row.lastTrustworthyAt||freshness(row.lastTrustworthyAt,now).stale)return 'UNKNOWN';
  if(row.persistedState==='SOLD_OUT')return 'NO_FEATURED_OFFER';
  if(['ERROR','BLOCKED','UNKNOWN'].includes(row.lastCheck?.observedState??''))return 'UNKNOWN';
  return row.persistedState??'UNKNOWN';
}
export function categoryComparisonHtml(row:BoardRow,now:Date):string {
  const ref=row.category_reference;if(!ref)return '<p class="note">No category reference yet.</p>';
  const exact=compareReferences(row,row.reference,now).references.find(r=>r.source==='Amazon México'&&r.status==='Historical comparison');
  const amount=exact?.referenceMxn??ref.amount_mxn;
  const age=now.getTime()-Date.parse(row.pricing_observed_at??'');
  const current=row.price_mxn!=null&&row.price_verification_status==='VERIFIED'&&Number.isFinite(age)&&age>=0&&age<=86400000;
  const delta=current?Math.round((row.price_mxn!/amount-1)*100):null;
  return '<p class="note"><strong>'+money(amount)+'</strong> · '+(exact?'Product launch reference':'Category price reference')+(delta===null?'':delta===0?' · At reference':' · '+Math.abs(delta)+'% '+(delta>0?'above':'below')+' reference')+'</p>';
}
const inventorySet = (row: BoardRow) => row.print_series?.trim() || printSeries(row.watch_category).trim() || 'Unconfirmed set';
const diagnosticIdHtml = (id?:string) => id ? `<p class="note">Diagnostic ID: <code style="overflow-wrap:anywhere;user-select:all">${escapeHtml(id)}</code></p>` : '';
const setKey = (name: string) => name.toLowerCase();
function huntCard(row: CatchHuntRow, now: Date, setName = 'Unconfirmed set', inventory?:BoardRow): string {
  const state=huntAvailability(row,now);
  const verifiedAt=state==="BUYABLE_VIA_OPTIONS"||state==="SOLD_OUT"?row.buyingOptions?.checkedAt:row.lastTrustworthyAt;
  const fresh = verifiedAt ? freshness(verifiedAt, now) : { text:"No trustworthy check yet", stale:true };
  const buying=state==='BUYABLE_VIA_OPTIONS'?row.buyingOptions?.lowestOffer:null;
  const currentEvidence = !fresh.stale && row.lastCheck && !["ERROR","BLOCKED","UNKNOWN"].includes(String(row.lastCheck.observedState ?? ""));
  const offer=buying?money(buying.priceMxn)+(buying.seller?' · Sold by '+buying.seller:''):currentEvidence&&row.lastCheck?.price?row.lastCheck.price:'Price unconfirmed';
  const status=catchStateClass(state),searchable=[row.name,"Amazon México",row.asin,"Catch Em All",row.diagnostic_id].join(" ").toLowerCase();
  return `<article class="hunt-card" data-search="${escapeHtml(searchable)}" data-status="${status}" data-set="${escapeHtml(setKey(setName))}" data-language="${escapeHtml(row.language??'unknown')}" data-store="amazon méxico" data-fulfilment="unverified"><div class="offer-top"><span class="status ${status}">${escapeHtml(catchStateLabel(state))}</span><span class="change">${escapeHtml(row.cadenceClass)} · ${escapeHtml(row.cadenceMinutes)} min</span></div>
    <p class="set">Amazon México hunt</p><h3>${escapeHtml(row.name)}</h3><p class="retailer"><code>${escapeHtml(row.asin)}</code></p>
    ${diagnosticIdHtml(row.diagnostic_id)}
    <p>${escapeHtml(offer)}</p><p class="retailer">${escapeHtml(languageLabel(row.language??"unknown"))}</p><div class="meta"><span>Live monitored</span><span class="${fresh.stale || row.overdue ? "stale" : ""}">${escapeHtml(row.overdue ? `Overdue: ${row.overdueReason ?? "monitoring delayed"}` : fresh.text)}</span></div>
    ${categoryComparisonHtml({...inventory,title:row.name,language:row.language??"unknown",watch_category:inventory?.watch_category??"",category_reference:row.category_reference??inventory?.category_reference,price_mxn:buying?.priceMxn??null,price_verification_status:buying?"VERIFIED":"PENDING",pricing_observed_at:buying?row.buyingOptions?.checkedAt:null} as BoardRow,now)}<details class="note"><summary>Check details</summary><p>Last attempt: ${escapeHtml(row.lastAttemptAt??"Not recorded")}<br>Next main-page check due: ${escapeHtml(row.nextCheckAt??"Not scheduled")}<br>Buying Options checked: ${escapeHtml(row.buyingOptions?.checkedAt??"Not recorded")}</p></details>
    <a class="buy" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">View on Amazon <span aria-hidden="true">↗</span></a></article>`;
}

function card(row: BoardRow, now: Date): string {
  const valueClassification = compareReferences(row,row.reference,now).offerStatus;
  const fresh = freshness(row.availability_observed_at ?? row.revalidation_last_success_at ?? row.last_seen_at, now);
  const effectiveStatus = fresh.stale || ["STALE","UNKNOWN","BLOCKED"].includes(row.revalidation_state ?? "") ? "unknown" : row.status;
  const crossBorder=row.fulfilment_region_state==="CROSS_BORDER_CONFIRMED";
  const fulfilment=crossBorder?"cross_border":row.fulfilment_region_state==="DOMESTIC"?"domestic":"unverified";
  const searchable = [row.title, row.retailer, row.retailer_sku, row.print_series, label(row.language), valueClassification,row.retailer_country,row.ship_from_country,fulfilment,row.diagnostic_id].join(" ").toLowerCase();
  return `<article class="offer" data-search="${escapeHtml(searchable)}" data-status="${escapeHtml(effectiveStatus)}" data-set="${escapeHtml(setKey(inventorySet(row)))}" data-language="${escapeHtml(row.language)}" data-store="${escapeHtml(row.retailer.toLowerCase())}" data-fulfilment="${fulfilment}">
    <div class="offer-top"><span class="status ${escapeHtml(effectiveStatus)}">${escapeHtml(fresh.stale?"Stale":row.revalidation_state==="BLOCKED"?"Access blocked":row.revalidation_state==="UNKNOWN"?"Unconfirmed":label(effectiveStatus))}</span>${crossBorder?`<span class="change">🌎 International offer</span>`:""}${row.last_change_type !== "unchanged" ? `<span class="change">${escapeHtml(label(row.last_change_type))}</span>` : ""}</div>
    <p class="set">${escapeHtml(row.print_series || label(row.watch_category))}</p>
    <h2>${escapeHtml(row.title)}</h2>
    ${diagnosticIdHtml(row.diagnostic_id)}
    <p class="retailer">${escapeHtml(row.retailer)}${row.retailer_sku ? ` <span>• SKU ${escapeHtml(row.retailer_sku)}</span>` : ""}</p>
    <div class="price">${escapeHtml(crossBorder&&row.original_price!=null&&row.original_currency?`${row.original_currency} ${row.original_price.toLocaleString("en-US")} displayed item price`:row.price_verification_status==="PENDING"?"Price verification pending":`${fresh.stale?"Last observed: ":""}${money(row.price_mxn)}`)}</div>${row.seller ? `<p class="retailer">Sold by ${escapeHtml(row.seller)}${row.fulfilled_by ? ` · Fulfilled by ${escapeHtml(row.fulfilled_by)}` : ""}${row.availability_evidence_type === "buying_options" ? " · Buying options" : ""}</p>` : ""}${crossBorder?`<p class="retailer">Retailer ${escapeHtml(row.retailer_country)} · Ships from ${escapeHtml(row.ship_from_country)} · Mexico delivery confirmed${row.shipping_mxn!=null?` · Shipping MX$${escapeHtml(row.shipping_mxn)}`:""} · Import costs ${escapeHtml(String(row.import_cost_status??"UNKNOWN").toLowerCase())}</p><p class="note"><strong>International seller.</strong> Shipping, import duties, taxes, currency conversion, and delivery times may be added or changed at checkout.</p>`:""}
    ${categoryComparisonHtml(row,now)}<details class="note"><summary>Historical reference details</summary>${referenceComparisonHtml(row,now)}</details>
    <div class="meta"><span>${escapeHtml(row.availability_freshness_status==="LIVE_MONITORED"?"Live monitored":row.refresh_enabled?"Daily refresh target":"Automatic refresh paused")} · <strong>${escapeHtml(label(row.language))}</strong></span><span class="${fresh.stale ? "stale" : ""}">${escapeHtml(fresh.text)}</span></div>
    <details class="note"><summary>Check details</summary><p>Last attempt: ${escapeHtml(row.revalidation_last_attempt_at??"Not recorded")}<br>Last result: ${escapeHtml(row.revalidation_last_outcome??"Not recorded")}<br>Next check due: ${escapeHtml(row.revalidation_due_at??"Not scheduled")}</p></details>
    <a class="buy" href="${escapeHtml(row.canonical_url)}" target="_blank" rel="noopener noreferrer">View product <span aria-hidden="true">↗</span></a>
  </article>`;
}

export function renderBoard(rows: BoardRow[], accessToken: string, now = new Date(), hunt: CatchHuntSnapshot = {available:false,mode:null,degraded:false,rollout:null,rows:[]}): string {
  const checks=rows.map(row=>compareReferences(row,row.reference,now));
  const reasons=new Map<string,number>();
  for(const check of checks)for(const result of check.references){const reason=`${result.source}: ${result.status}`;reasons.set(reason,(reasons.get(reason)??0)+1);}
  const coverage=checks.filter(check=>check.references.some(r=>r.deltaPercent!=null)).length;
  const huntedAsins = new Set(hunt.rows.map(row => row.asin));
  const inventoryRows = rows.filter(row => !(row.retailer.toLowerCase().includes("amazon") && huntedAsins.has(boardAsin(row) ?? "")));
  const knownSets = [...new Set(rows.map(inventorySet))].filter(name=>name!=='Unconfirmed set').sort((a,b)=>b.length-a.length);
  const huntSets = new Map(hunt.rows.map(item=>[item.asin,knownSets.find(name=>item.name.toLowerCase().includes(name.toLowerCase())) ?? 'Unconfirmed set']));
  const sets = [...new Map([...inventoryRows.map(inventorySet),...huntSets.values()].map(name=>[setKey(name),name])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const available = inventoryRows.filter((row) => row.status === "available" && !freshness(row.availability_observed_at ?? row.revalidation_last_success_at ?? row.last_seen_at,now).stale && !["STALE","UNKNOWN","BLOCKED"].includes(row.revalidation_state ?? "")).length + hunt.rows.filter(row => ["BUYABLE","BUYABLE_VIA_OPTIONS","PREORDER_BUYABLE"].includes(huntAvailability(row,now)) && !row.overdue).length;
  const retailers = new Set([...inventoryRows.map((row) => row.retailer.toLowerCase()), ...(hunt.rows.length ? ["amazon méxico"] : [])]).size;
  const lastVerified = inventoryRows.reduce((latest, row) => (row.revalidation_last_success_at ?? row.last_seen_at) > latest ? (row.revalidation_last_success_at ?? row.last_seen_at) : latest, "");
  const stores = [...new Map([...inventoryRows.map((row) => [row.retailer.toLowerCase(), row.retailer] as [string,string]),...(hunt.rows.length?[["amazon méxico","Amazon México"] as [string,string]]:[])]).entries()]
    .sort((left, right) => left[1].localeCompare(right[1], "es-MX"));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#11130f">
<title>Spawn Live Inventory</title><meta name="description" content="Current Pokémon TCG inventory monitored by Spawn.">
<style>
:root{color-scheme:dark;--bg:#11130f;--panel:#191c17;--line:#30352b;--text:#f4f5ee;--muted:#aab19f;--lime:#c9f65a;--green:#86d98b;--amber:#f1bd62;--red:#ff7770;--blue:#8bb9ff}*{box-sizing:border-box}
body{margin:0;background:radial-gradient(circle at 80% -10%,#30421b 0,transparent 28rem),var(--bg);color:var(--text);font:15px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}a{color:inherit}
.shell{width:min(1180px,calc(100% - 28px));margin:auto;padding:44px 0 72px}.eyebrow,.set{color:var(--lime);font-size:.73rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hero{display:grid;grid-template-columns:1.35fr .65fr;gap:34px;align-items:end;margin-bottom:30px}.hero h1{font-size:clamp(2.6rem,7vw,5.6rem);line-height:.92;letter-spacing:-.065em;margin:.25rem 0 1rem}.hero p{max-width:650px;color:var(--muted);font-size:1.05rem}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;border:1px solid var(--line);background:var(--line);border-radius:18px;overflow:hidden}.summary div{min-width:0;overflow-wrap:anywhere;background:#171a15;padding:20px}.summary strong{display:block;font-size:1.7rem}.summary span{color:var(--muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.08em}
.controls{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:2fr repeat(4,1fr) auto;gap:10px;margin:24px 0;padding:12px;background:rgba(17,19,15,.9);backdrop-filter:blur(14px);border:1px solid var(--line);border-radius:16px}.controls input,.controls select{width:100%;min-width:0;border:1px solid var(--line);background:#20241d;color:var(--text);padding:11px 12px;border-radius:10px;font:inherit}.download{display:grid;place-items:center;padding:0 16px;border-radius:10px;background:var(--lime);color:#15180f;text-decoration:none;font-weight:800}
.grid,.hunt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.hunt{margin:30px 0}.hunt-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:14px}.hunt-head h2{margin:0;font-size:1.8rem}.hunt-health{color:var(--muted);text-align:right}.hunt-card{display:flex;flex-direction:column;min-height:270px;padding:18px;border:1px solid #42502f;border-radius:16px;background:#171b14}.hunt-card[hidden]{display:none}.hunt-card h3{font-size:1.05rem;margin:0 0 8px}.offer{display:flex;flex-direction:column;min-height:410px;padding:20px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#1d211a,#161914);box-shadow:0 16px 50px rgba(0,0,0,.16)}.offer[hidden]{display:none}.offer-top{display:flex;gap:8px;min-height:25px}.status,.change{align-self:flex-start;padding:4px 8px;border-radius:999px;font-size:.69rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.status.available{background:#183c22;color:#9be4a5}.status.sold_out{background:#3a201e;color:#ffa59e}.status.unknown{background:#35352a;color:#e3dba3}.change{background:#20334d;color:#9bc5ff}.set{margin:18px 0 5px}.offer h2{font-size:1.13rem;line-height:1.25;margin:0 0 8px}.retailer{color:var(--muted);margin:0}.retailer span{font-size:.76rem}.price{font-size:1.65rem;font-weight:850;letter-spacing:-.03em;margin:20px 0 12px}.comparisons{margin:0;border-block:1px solid var(--line);padding:8px 0}.comparisons div{display:flex;justify-content:space-between;align-items:center;padding:6px 0}.comparisons dt{color:var(--muted)}.comparisons dd{margin:0}.comparison{font-weight:800}.comparison.good{color:var(--green)}.comparison.bad{color:var(--red)}.comparison.warn{color:var(--amber)}.comparison.neutral{color:var(--text)}.comparison.unavailable{color:#747a6e;font-weight:600}.meta{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:.75rem;margin:14px 0}.stale{color:var(--amber)}.buy{margin-top:auto;display:flex;justify-content:space-between;padding:11px 13px;border:1px solid #4b5840;border-radius:10px;text-decoration:none;font-weight:750}.buy:hover,.buy:focus{border-color:var(--lime);color:var(--lime)}.empty{display:none;text-align:center;color:var(--muted);padding:60px 0}.note{color:var(--muted);font-size:.78rem;margin:24px 0 0}.note strong{color:var(--text)}
@media(max-width:900px){.hero{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}.grid,.hunt-grid{grid-template-columns:repeat(2,1fr)}.controls{grid-template-columns:1fr 1fr}.controls input{grid-column:1/-1}.download{min-height:44px}}
@media(max-width:620px){.shell{width:min(100% - 20px,1180px);padding-top:28px}.summary{grid-template-columns:1fr}.summary div{padding:13px 16px}.controls{position:static;grid-template-columns:1fr}.controls input{grid-column:auto}.grid,.hunt-grid{grid-template-columns:1fr}.hunt-head{align-items:start;flex-direction:column}.hunt-health{text-align:left;margin:0}.offer{min-height:380px}.meta{flex-direction:column}.hero h1{font-size:3rem}}
</style></head><body><main class="shell">
<section class="hero"><div><div class="eyebrow">Project Spawn</div><h1>Live inventory,<br>without the noise.</h1><p>Pokémon TCG listings discovered and periodically refreshed across Mexico, together with the Amazon products actively hunted by Catch.</p></div>
<div class="summary"><div><strong>${available}</strong><span>Confirmed available</span></div><div><strong>${inventoryRows.length + hunt.rows.length}</strong><span>Inventory offers</span></div><div><strong>${hunt.rows.length}</strong><span>Catch Amazon ASINs</span></div><div><strong>${retailers}</strong><span>Retailers</span></div></div></section>
<p><a href="/dashboard/inventory-diagnostics?access=${encodeURIComponent(accessToken)}">Look up a diagnostic UUID</a></p><section class="controls" aria-label="Inventory filters"><input id="search" type="search" placeholder="Search product, store, SKU or UUID…" aria-label="Search inventory">
<select id="store" aria-label="Filter by store"><option value="">All stores</option>${stores.map(([value, name]) => `<option value="${escapeHtml(value)}">${escapeHtml(name)}</option>`).join("")}</select>
<select id="status" aria-label="Filter by status"><option value="">All statuses</option><option value="available">Available</option><option value="sold_out">Sold out</option><option value="unknown">Unknown</option></select>
<select id="set" aria-label="Filter by set"><option value="">All sets</option>${sets.map(([value,name])=>`<option value="${escapeHtml(value)}">${escapeHtml(name)}</option>`).join('')}</select>
<select id="language" aria-label="Filter by language"><option value="">All languages</option>${PRODUCT_LANGUAGES.map(language=>`<option value="${language}">${languageLabel(language)}</option>`).join("")}</select>
<select id="fulfilment" aria-label="Filter by fulfilment"><option value="">All fulfilment</option><option value="domestic">Domestic</option><option value="cross_border">International</option><option value="unverified">Unverified</option></select>
<a class="download" href="/inventory.csv?access=${encodeURIComponent(accessToken)}">Excel / CSV</a></section>
${!hunt.available?'<p class="note" role="status"><strong>Amazon monitoring feed is temporarily unavailable.</strong> Amazon hunt listings could not be loaded. Reload this page to retry; the inventory shown below may be incomplete.</p>':''}
<details class="note"><summary>Reference coverage: ${coverage} of ${rows.length} inventory offers have a checked comparison</summary><p>Computed from stored evidence when this page loads. Missing references do not mean an external price search failed. Catch hunt cards show reference context only because their feed does not supply verified numeric price evidence for this comparison.</p><ul>${[...reasons].sort().map(([reason,count])=>`<li>${escapeHtml(reason)}: ${count}</li>`).join('')}</ul><a href="/dashboard">Review pricing references in diagnostics</a></details>
<section id="grid" class="grid">${hunt.rows.map(row => huntCard(row,now,huntSets.get(row.asin),rows.find(item=>item.retailer.toLowerCase().includes('amazon')&&boardAsin(item)===row.asin))).join("")}${inventoryRows.map((row) => card(row, now)).join("")}</section><div id="empty" class="empty">No offers match these filters.</div>
<p class="note"><strong>Monitoring distinction:</strong> Spawn discovers and periodically refreshes broad market listings. Catch actively hunts only the approved Amazon ASINs shown above. A persisted state is the last trustworthy observation, not a guarantee of current stock.</p>
<p class="note"><strong>Category price references:</strong> standard English ETB MX$1,100 · booster bundle MX$629 · three-pack blister MX$349 · binder MX$594 · UPC MX$3,370 · poster MX$329 · premium collection MX$749. Operator guidelines, not official MSRP. Edition-specific evidence takes precedence. Historical Collectr and Amazon references are available in details.</p>
<p class="note">Last inventory verification: ${escapeHtml(lastVerified ? new Intl.DateTimeFormat("en-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }).format(new Date(lastVerified)) : "Unavailable")}.</p>
</main><script>
const controls=[...document.querySelectorAll('input,select')],cards=[...document.querySelectorAll('.offer,.hunt-card')],empty=document.getElementById('empty');
function filter(){const q=document.getElementById('search').value.trim().toLowerCase(),store=document.getElementById('store').value,status=document.getElementById('status').value,set=document.getElementById('set').value,language=document.getElementById('language').value,fulfilment=document.getElementById('fulfilment').value;let visible=0;for(const card of cards){const show=(!q||card.dataset.search.includes(q))&&(!store||card.dataset.store===store)&&(!status||card.dataset.status===status)&&(!set||card.dataset.set===set)&&(!language||card.dataset.language===language)&&(!fulfilment||card.dataset.fulfilment===fulfilment);card.hidden=!show;if(show)visible++}empty.style.display=visible?'none':'block'}controls.forEach(control=>control.addEventListener('input',filter));
</script></body></html>`;
}

export function boardHeaders(): HeadersInit {
  return { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };
}
