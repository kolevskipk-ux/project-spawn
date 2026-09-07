import {runAmazonVerification,reviewAmazonCandidate} from '../src/verification';
import {resolveAmazonIdentity} from '../src/identity-review';
import {handleFetch} from '../src/index';
import {handleCatchInventoryObservation} from '../src/catch-inventory';
import {validatePublishedAmazonCatalog,announceNewCatalogTargets,buildInventoryObservation,hmacSha256Hex} from '../../catch-em-all/src/worker.js';
import type {Env} from '../src/types';

type TestEnv={SPAWN_DB:D1Database;REHEARSAL_TOKEN:string};
function check(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}

async function exercise(env:TestEnv){
  // No retailer/API/webhook bindings are supplied. All acquisition and delivery below are fixtures.
  const runtime={SPAWN_DB:env.SPAWN_DB,CATCH_INGEST_SECRET:env.REHEARSAL_TOKEN} as Env;
  const results:Array<Record<string,unknown>>=[];
  const baseline=await env.SPAWN_DB.prepare("SELECT asin,canonical_product_id FROM amazon_watchlist WHERE lifecycle_status='PUBLISHED' ORDER BY asin").all();
  for(const [index,language] of ['spanish','japanese','unknown'].entries()){
    const asin=`B0TST0000${index+1}`,stamp=new Date().toISOString();
    await env.SPAWN_DB.prepare(`INSERT INTO amazon_watchlist(asin,product_name,product_url,watch_category,language,source,evidence,first_discovered_at,last_discovered_at,updated_at)
      VALUES(?,?,?,'pokemon_tcg','unknown','baseline_remote_rehearsal','Synthetic fixture; never acquire',?,?,?)`)
      .bind(asin,'Synthetic sealed booster',`https://www.amazon.com.mx/dp/${asin}`,stamp,stamp,stamp).run();
    const verification=await runAmazonVerification(runtime,asin,'rehearsal:verifier',async()=>new Response(`<title>Amazon fixture</title> ${asin}`,{status:200}));
    check(verification.ok,'Independent verification failed');
    const input={attemptId:verification.attemptId,evidenceRevision:verification.evidenceRevision,productName:'Synthetic sealed booster',setName:'Synthetic set',format:'Sealed booster',language,evidenceUrl:'https://evidence.invalid/fixture',reason:'Synthetic runtime rehearsal evidence',acknowledgeUnknown:language==='unknown'};
    check(!(await resolveAmazonIdentity(runtime,asin,{...input,evidenceRevision:'outdated'},'rehearsal:admin')).ok,'Stale evidence accepted');
    check((await resolveAmazonIdentity(runtime,asin,input,'rehearsal:admin')).ok,'Identity resolution failed');
    const row=await env.SPAWN_DB.prepare('SELECT verification_attempt_id,evidence_revision FROM amazon_watchlist WHERE asin=?').bind(asin).first<{verification_attempt_id:number;evidence_revision:string}>();
    check(row,'Resolved identity missing');
    const review={attemptId:row.verification_attempt_id,evidenceRevision:row.evidence_revision,reason:'Synthetic test monitoring approval',lane:'normal' as const,routingKey:'pokemon-main' as const};
    const approvals=await Promise.all([reviewAmazonCandidate(runtime,asin,'approve',review,'rehearsal:one'),reviewAmazonCandidate(runtime,asin,'approve',review,'rehearsal:two')]);
    check(approvals.filter(result=>result.ok).length===1,'Concurrent approval must have one winner');
    const versionBefore=await env.SPAWN_DB.prepare("SELECT value FROM worker_state WHERE key='amazon_catalog_version'").first<{value:string}>();
    const publications=await Promise.all([reviewAmazonCandidate(runtime,asin,'publish',review,'rehearsal:one'),reviewAmazonCandidate(runtime,asin,'publish',review,'rehearsal:two')]);
    check(publications.filter(result=>result.ok).length===1,'Concurrent publication must have one winner');
    const versionAfter=await env.SPAWN_DB.prepare("SELECT value FROM worker_state WHERE key='amazon_catalog_version'").first<{value:string}>();
    check(Number(versionAfter?.value)===Number(versionBefore?.value??0)+1,'Catalog version increment mismatch');
    const response=await handleFetch(new Request('https://fixture.invalid/internal/garfield/amazon-watchlist',{headers:{authorization:`Bearer ${env.REHEARSAL_TOKEN}`}}),runtime);
    const catalog=validatePublishedAmazonCatalog(await response.json());
    check(catalog,'Catch rejected Spawn catalog');
    const item=catalog.find((target:{asin:string})=>target.asin===asin);
    check(item?.language===language,'Catalog language mismatch');
    const observation=await buildInventoryObservation({id:`amazon-${asin.toLowerCase()}`,source:'spawn-published-catalog',canonicalProductId:item.canonical_product_id,name:item.product_name,asin,url:item.product_url,routingKey:item.routing_key,watchCategory:item.watch_category},{checkedAt:new Date().toISOString(),observedState:'BUYABLE'},null,'direct_page');
    check(observation,'Catch observation missing');
    const body=JSON.stringify(observation),timestamp=String(Math.floor(Date.now()/1000));
    const signature=await hmacSha256Hex(env.REHEARSAL_TOKEN,`${timestamp}.${body}`);
    const received=await handleCatchInventoryObservation(new Request('https://fixture.invalid/internal/catch-inventory-observations',{method:'POST',body,headers:{'x-spawn-timestamp':timestamp,'x-spawn-signature':`sha256=${signature}`}}),runtime);
    check(received.status===202,`Observation rejected (${received.status})`);
    const inventory=await env.SPAWN_DB.prepare('SELECT language,product_id FROM inventory WHERE retailer_sku=?').bind(asin).first<{language:string;product_id:string|null}>();
    check(inventory?.language===language&&inventory.product_id===null,'Inventory language or price identity mismatch');
    const state=new Map<string,string>(),deliveryEnv={STATE:{get:async(key:string)=>state.get(key)??null,put:async(key:string,value:string)=>{state.set(key,value);}},DISCORD_WEBHOOK_URL:'https://discord.invalid/fixture'};
    let deliveries=0;
    const failed=await announceNewCatalogTargets(deliveryEnv,[],[item],{fetchFn:async()=>new Response(null,{status:503})});
    check(failed[0]?.status==='pending-delivery','Failed delivery not retained');
    const options={fetchFn:async()=>{deliveries++;return new Response(null,{status:204});}};
    await announceNewCatalogTargets(deliveryEnv,[],[item],options);
    await announceNewCatalogTargets(deliveryEnv,[],[item],options);
    check(deliveries===1,'Sequential delivery retry duplicated');
    results.push({language,approval_winners:1,publication_winners:1,catalog_version_increment:1,inventory_language:inventory.language,fake_delivery_count:deliveries});
  }
  const after=await env.SPAWN_DB.prepare("SELECT asin,canonical_product_id FROM amazon_watchlist WHERE lifecycle_status='PUBLISHED' AND source!='baseline_remote_rehearsal' ORDER BY asin").all();
  check(JSON.stringify(after.results)===JSON.stringify(baseline.results),'Pre-existing published identities changed');
  return {ok:true,executed_at:new Date().toISOString(),runtime:'Deployed Cloudflare Worker with isolated remote D1',results,baseline_preserved:true,real_retailer_requests:0,real_discord_requests:0};
}

export default {async fetch(request:Request,env:TestEnv){
  if(!env.REHEARSAL_TOKEN||request.headers.get('authorization')!==`Bearer ${env.REHEARSAL_TOKEN}`||request.method!=='POST')return new Response('Not found',{status:404});
  try{return Response.json(await exercise(env));}catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:'Rehearsal failed'},{status:500});}
}} satisfies ExportedHandler<TestEnv>;
