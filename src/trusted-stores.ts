import type {Env} from './types';
import {assessProductEvidence} from './product-page-evidence';
import {canonicalizeUrl,amazonAsin} from './inventory';
import {runAmazonVerification} from './verification';
import {resolveAmazonIdentity} from './identity-review';
import {catalogCategory} from './store-catalog-parser';

const categories=new Set(['pokemon_tcg','30th_celebration','ascended_heroes','delta_reign','mtg_hobbit_collector_box','mtg_tcg']);
type Candidate=Record<string,unknown>;
type Rule={id:string;origin:string;seller_key:string;category:string;source_candidate_id:string;created_by:string;created_at:string;include_pending:number;all_sets:number;policy_updated_at:string|null};
const normalized=(value:unknown)=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export function storeOrigin(value:string):string|null {
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&/^[a-z][a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)&&!url.hostname.endsWith('.localhost')?url.origin:null;}catch{return null;}
}
const marketplace=(host:string)=>/(^|\.)(amazon|mercadolibre|walmart|liverpool|ebay)\.[a-z.]+$/.test(host);
function exactPage(value:unknown,url:string){try{return typeof value==='string'&&canonicalizeUrl(new URL(value,url).href)===canonicalizeUrl(url);}catch{return false;}}

// Exact-page Product evidence only. Names of marketplace sellers are not stable IDs.
export function assessTrustedStorePage(html:string,url:string,title:string,sku:string|null) {
  const origin=storeOrigin(url);if(!origin)return null;
  const nodes:Record<string,any>[]=[];
  const visit=(value:any)=>{if(Array.isArray(value)){value.forEach(visit);return;}if(value&&typeof value==='object'){nodes.push(value);if(value['@graph'])visit(value['@graph']);if(value.mainEntity)visit(value.mainEntity);}};
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{visit(JSON.parse(match[1]));}catch{}
  const products=nodes.filter(p=>[p['@type']].flat().some(t=>t==='Product'||t==='https://schema.org/Product')&&[p.url,p['@id']].some(v=>exactPage(v,url)));
  if(products.length!==1)return null;
  const product=products[0];
  if(normalized(product.name)!==normalized(title)||(sku&&String(product.sku??'')!==sku))return null;
  const offers=Array.isArray(product.offers)?product.offers:[product.offers];
  if(offers.length!==1||!offers[0]||offers[0]['@type']==='AggregateOffer')return null;
  const offer=offers[0],seller=offer.seller;
  const identifier=typeof seller==='object'&&seller?seller.identifier?.value??seller.identifier:null;
  let sellerId=typeof identifier==='string'||typeof identifier==='number'?String(identifier).trim():'';
  if(!sellerId&&seller&&typeof seller==='object'){
    // A page-local #seller node identifies a role, not a merchant across listings.
    try{const identityUrl=new URL(seller['@id']??seller.url);if(identityUrl.protocol==='https:'&&!identityUrl.hash&&!identityUrl.username&&!identityUrl.password&&identityUrl.pathname!=='/'&&!exactPage(identityUrl.href,url))sellerId=identityUrl.href;}catch{}
  }
  const isMarketplace=marketplace(new URL(url).hostname);
  if(isMarketplace&&!sellerId)return null;
  const shipping=[offer.shippingDetails].flat().filter(Boolean);
  const domestic=shipping.some(d=>d.shippingOrigin?.addressCountry==='MX'&&d.shippingDestination?.addressCountry==='MX');
  const evidence=assessProductEvidence(200,html,url,title,sku);
  if(!['AVAILABLE','SOLD_OUT'].includes(evidence.outcome))return null;
  return {origin,sellerKey:sellerId?`seller:${sellerId}`:`store:${origin}`,domestic,evidence:evidence.evidence,category:catalogCategory(title+' '+String(product.brand?.name??product.brand??'')),format:title.match(/elite trainer box|booster bundle|booster box|collector booster|collection|\bdeck\b|\bblister\b|\btin\b/i)?.[0]??null};
}

async function pageProof(candidate:Candidate,fetchFn:typeof fetch) {
  const url=String(candidate.source_url);if(!storeOrigin(url))return null;
  const response=await fetchFn(url,{redirect:'manual',signal:AbortSignal.timeout(12_000),headers:{Accept:'text/html'}});
  if(response.status!==200)return null;
  const html=await response.text();if(html.length>2_000_000)return null;
  return assessTrustedStorePage(html,url,String(candidate.product_name),candidate.retailer_sku?String(candidate.retailer_sku):null);
}

export async function registerTrustedStore(env:Env,candidate:Candidate,form:FormData,actor:string,fetchFn:typeof fetch=fetch) {
  if(form.get('trust_store')!=='on'||actor.startsWith('auto:'))return;
  const category=String(candidate.watch_category??candidate.product_family);
  const proof=categories.has(category)&&form.get('fulfilment_region_state')==='DOMESTIC'?await pageProof(candidate,fetchFn):null;
  if(!proof){
    await env.SPAWN_DB.prepare('INSERT INTO trusted_store_attempts(id,candidate_id,attempted_at,outcome,details_json) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),candidate.candidate_id,new Date().toISOString(),'TRUST_NOT_CREATED',JSON.stringify({detail:'Listing approved. Store trust needs a supported category, reviewed domestic fulfilment, exact-product evidence and a stable marketplace seller ID.',actor})).run();
    return;
  }
  const now=new Date().toISOString();
  await env.SPAWN_DB.prepare(`INSERT INTO trusted_store_rules(id,origin,seller_key,category,source_candidate_id,created_by,created_at,evidence_json)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(origin,seller_key,category) DO NOTHING`)
    .bind(crypto.randomUUID(),proof.origin,proof.sellerKey,category,candidate.candidate_id,actor,now,JSON.stringify({sourceUrl:candidate.source_url,proof})).run();
}

type Publish=(candidateId:string,form:FormData,actor:string)=>Promise<boolean>;
export async function runTrustedStoreApprovals(env:Env,publish:Publish,fetchFn:typeof fetch=fetch) {
  const backlog=env.AMAZON_PENDING_AUTOMATION_ENABLED==='true';
  if(env.TRUSTED_STORE_AUTO_APPROVAL_ENABLED!=='true'&&!backlog)return;
  const rules=(await env.SPAWN_DB.prepare('SELECT * FROM trusted_store_rules WHERE enabled=1').all<Rule>()).results;
  if(!rules.length)return;
  const pending=(await env.SPAWN_DB.prepare(`SELECT c.*,COALESCE(i.watch_category,w.watch_category,c.product_family) watch_category FROM monitoring_candidates c LEFT JOIN inventory i ON i.listing_key=c.source_listing_key LEFT JOIN amazon_watchlist w ON w.product_url=c.source_url
    WHERE c.status='PENDING' AND (c.review_eligible=1 OR ?=1) AND (c.source!='codex_seed' OR ?=1)
    AND (?=1 OR c.source_url LIKE 'https://www.amazon.com.mx/%')
    AND NOT EXISTS(SELECT 1 FROM vendors v WHERE v.vendor_key=c.vendor_key AND v.status='SUPPRESSED')
    AND NOT EXISTS(SELECT 1 FROM trusted_store_attempts t WHERE t.candidate_id=c.candidate_id AND t.attempted_at>?)
    AND EXISTS(SELECT 1 FROM trusted_store_rules r WHERE r.enabled=1 AND (r.category=COALESCE(i.watch_category,w.watch_category,c.product_family) OR (?=1 AND r.all_sets=1)) AND (c.discovered_at>=r.created_at OR (?=1 AND r.include_pending=1)) AND (c.source!='codex_seed' OR r.include_pending=1) AND c.source_url LIKE r.origin||'/%')
    ORDER BY c.discovered_at,c.candidate_id LIMIT ?`).bind(Number(backlog),Number(backlog),Number(env.TRUSTED_STORE_AUTO_APPROVAL_ENABLED==='true'),new Date(Date.now()-24*3600_000).toISOString(),Number(backlog),Number(backlog),backlog?6:2).all<Candidate>()).results;
  for(const candidate of pending){
    const id=String(candidate.candidate_id),owner=crypto.randomUUID(),resource=`/dashboard/listing/${id}`,now=Date.now(),asin=amazonAsin(String(candidate.source_url));
    const resources=[resource,...asin?[`/dashboard/verification/${asin}`,`product:${asin}`]:[]],held:string[]=[];
    for(const resource of resources){
    const lock=await env.SPAWN_DB.prepare('INSERT INTO ops_review_locks(resource,owner,expires_at) VALUES(?,?,?) ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE ops_review_locks.expires_at<?').bind(resource,owner,now+300_000,now).run();
    if(!lock.meta.changes)break;held.push(resource);
    }
    if(held.length!==resources.length){for(const resource of held)await env.SPAWN_DB.prepare('DELETE FROM ops_review_locks WHERE resource=? AND owner=?').bind(resource,owner).run();continue;}
    let outcome='MANUAL_REVIEW',rule:Rule|undefined,detail='Current product, seller or shipping evidence is incomplete.';
    try {
      if(asin){const watch=await env.SPAWN_DB.prepare('SELECT lifecycle_status FROM amazon_watchlist WHERE asin=?').bind(asin).first<{lifecycle_status:string}>();if(!watch||!['DISCOVERED','VERIFIED'].includes(watch.lifecycle_status)){detail='Amazon target requires manual lifecycle review.';continue;}}
      const proof=await pageProof(candidate,fetchFn);
      rule=proof?rules.find(r=>r.origin===proof.origin&&r.seller_key===proof.sellerKey&&(r.category===candidate.watch_category||(backlog&&r.all_sets&&proof.category))&&(String(candidate.discovered_at)>=r.created_at||(backlog&&r.include_pending))&&(candidate.source!=='codex_seed'||r.include_pending)):undefined;
      if(proof?.domestic&&rule){
        let verified=true;
        if(asin){
          const result=await runAmazonVerification(env,asin,`auto:trusted-store:${rule.id}`,(input,init)=>fetchFn(input,{...init,redirect:'manual',signal:AbortSignal.timeout(12_000)}),{requestApproval:false});verified=result.ok&&result.assessment.outcome==='VERIFIED';
          if(!verified&&backlog&&rule.include_pending&&result.ok&&result.assessment.accessOutcome==='VALID_PAGE'&&proof.category&&proof.format){
            const watch=await env.SPAWN_DB.prepare('SELECT language FROM amazon_watchlist WHERE asin=?').bind(asin).first<{language:string}>();
            if(watch?.language&&watch.language!=='unknown'&&watch.language!=='other'){
              const resolved=await resolveAmazonIdentity(env,asin,{attemptId:result.attemptId,evidenceRevision:result.evidenceRevision,productName:String(candidate.product_name),setName:String(candidate.print_series||'Unspecified set'),format:proof.format,language:watch.language,evidenceUrl:String(candidate.source_url),reason:`Exact product schema and seller policy ${rule.id}`,acknowledgeUnknown:false},`auto:trusted-store:${rule.id}`);
              verified=resolved.ok;
            }
          }
          if(verified)await env.SPAWN_DB.prepare("UPDATE monitoring_candidates SET review_eligible=1 WHERE candidate_id=? AND status='PENDING'").bind(id).run();
        }
        const active=await env.SPAWN_DB.prepare(`SELECT r.id FROM trusted_store_rules r WHERE r.id=? AND r.enabled=1 AND NOT EXISTS(SELECT 1 FROM vendors WHERE vendor_key=? AND status='SUPPRESSED') AND EXISTS(SELECT 1 FROM monitoring_candidates WHERE candidate_id=? AND status='PENDING')`).bind(rule.id,candidate.vendor_key,id).first();
        if(active&&verified){
          const previous=asin?await env.SPAWN_DB.prepare('SELECT poll_interval_minutes,approved_at FROM amazon_watchlist WHERE asin=?').bind(asin).first<{poll_interval_minutes:number;approved_at:string|null}>():null;
          if(asin&&backlog&&rule.include_pending&&String(candidate.discovered_at)<=(rule.policy_updated_at??rule.created_at))await env.SPAWN_DB.batch([
            env.SPAWN_DB.prepare("UPDATE monitoring_candidates SET automatic_baseline=1 WHERE candidate_id=? AND status='PENDING'").bind(id),
            env.SPAWN_DB.prepare("UPDATE amazon_watchlist SET automatic_baseline=1 WHERE asin=? AND lifecycle_status IN ('DISCOVERED','VERIFIED')").bind(asin)
          ]);
          const form=new FormData();for(const [key,value] of Object.entries({action:'publish',disposition:asin?(previous?.approved_at&&previous.poll_interval_minutes===5?'five_minute':'hourly'):'visibility_only',fulfilment_region_state:'DOMESTIC',retailer_country:'MX',ship_from_country:'MX',reason:`Automatically approved by trusted-store rule ${rule.id}; source approval ${rule.source_candidate_id}; fresh exact-product, seller and Mexico shipping evidence checked.`}))form.set(key,value);
          // Persist the flag before publication so an interrupted invocation remains visible.
          await env.SPAWN_DB.prepare('INSERT INTO trusted_store_attempts(id,candidate_id,rule_id,attempted_at,outcome,details_json) VALUES(?,?,?,?,?,?)').bind(owner,id,rule.id,new Date().toISOString(),'IN_PROGRESS',JSON.stringify({detail:'Publication started; reconcile the listing and Catch state if interrupted.',evidence:proof})).run();
          const accepted=await publish(id,form,`auto:trusted-store:${rule.id}`);
          outcome=accepted?'AUTO_APPROVED':'MANUAL_REVIEW';detail=accepted?(asin?'Published to inventory and Catch catalog; Ascended Heroes uses warm 30-minute monitoring, other new targets hourly. Catch acknowledgement is separate.':'Published to inventory.'):'Publication gates did not pass; check inventory and Catch state for a partial publication.';
        }
      }
    } catch {outcome='ERROR';detail='Verification or publication failed; inspect the current listing decision before retrying.';}
    finally {
      await env.SPAWN_DB.prepare(`INSERT INTO trusted_store_attempts(id,candidate_id,rule_id,attempted_at,outcome,details_json) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET outcome=excluded.outcome,details_json=json_set(trusted_store_attempts.details_json,'$.detail',json_extract(excluded.details_json,'$.detail'))`).bind(owner,id,rule?.id??null,new Date().toISOString(),outcome,JSON.stringify({detail})).run().catch(console.error);
      for(const resource of held)await env.SPAWN_DB.prepare('DELETE FROM ops_review_locks WHERE resource=? AND owner=?').bind(resource,owner).run().catch(console.error);
    }
  }
}
