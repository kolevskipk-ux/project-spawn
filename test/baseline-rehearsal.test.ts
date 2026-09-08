import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleFetch} from '../src/index';
import {resolveAmazonIdentity} from '../src/identity-review';
import {reviewAmazonCandidate,runAmazonVerification} from '../src/verification';
import {validatePublishedAmazonCatalog,languageLabel} from '../src/contracts/amazon-catalog.mjs';
import {announceNewCatalogTargets,sendDiscord,buildInventoryObservation,hmacSha256Hex} from '../../catch-em-all/src/worker.js';
import {handleCatchInventoryObservation} from '../src/catch-inventory';
import type {Env} from '../src/types';
import {updateInventory} from '../src/inventory';

let db:DatabaseSync,env:Env;
const asin='B0H27L3TKW';
function adapter(){
  const prepare=(sql:string)=>{
    let values:unknown[]=[];
    return {bind(...args:unknown[]){values=args;return this;},async first(){return db.prepare(sql).get(...values as never[])??null;},
      async all(){return {results:db.prepare(sql).all(...values as never[]),success:true};},
      execute(){const result=db.prepare(sql).run(...values as never[]);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},async run(){return this.execute();}};
  };
  return {prepare,async batch(statements:Array<{execute:()=>unknown}>){db.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(statement.execute());db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
beforeEach(()=>{
  db=new DatabaseSync(':memory:');
  for(const file of readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${file}`,'utf8'));
  env={SPAWN_DB:adapter(),CATCH_INGEST_SECRET:'test-only-secret-for-local-rehearsal-1234'} as unknown as Env;
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO amazon_watchlist(asin,product_name,product_url,watch_category,language,source,evidence,first_discovered_at,last_discovered_at,updated_at)
    VALUES(?,?,?,'pokemon_tcg','unknown','test','Search result only',?,?,?)`).run(asin,'Mega Evolution Pitch sleeve booster',`https://www.amazon.com.mx/dp/${asin}`,now,now,now);
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('Unexpected network access in baseline rehearsal');}));
});
afterEach(()=>{db.close();vi.unstubAllGlobals();});
async function verify(html=`<title>Amazon product</title> ${asin}`){
  return runAmazonVerification(env,asin,'test-verifier',async()=>new Response(html,{status:200}));
}
function resolution(language='spanish'){
  const row=db.prepare('SELECT verification_attempt_id,evidence_revision FROM amazon_watchlist WHERE asin=?').get(asin)!;
  return {attemptId:Number(row.verification_attempt_id),evidenceRevision:String(row.evidence_revision),productName:'Mega Evolution sleeve booster',setName:'Mega Evolution',format:'Sealed sleeved booster',language,evidenceUrl:`https://www.amazon.com.mx/dp/${asin}`,reason:'Reviewed packaging and product details in the fixture',acknowledgeUnknown:language==='unknown'};
}
async function reviewInput(){const row=db.prepare('SELECT verification_attempt_id,evidence_revision FROM amazon_watchlist WHERE asin=?').get(asin)!;return {attemptId:Number(row.verification_attempt_id),evidenceRevision:String(row.evidence_revision),reason:'Approved monitoring in isolated rehearsal',lane:'normal' as const,routingKey:'pokemon-main' as const};}

describe('baseline rehearsal: real schema, Spawn decisions, Catch contract and fake Discord',()=>{
  async function approveProduct(destination='monitor',overrides:Record<string,string>={}){
    env.BOARD_ACCESS_TOKEN='test-board';
    const row=db.prepare('SELECT evidence_revision FROM amazon_watchlist WHERE asin=?').get(asin)!;
    const form=new FormData();
    for(const [key,value] of Object.entries({action:'approve_product',evidence_revision:String(row.evidence_revision??''),destination,product_name:'Mega Evolution sleeve booster',set_name:'Mega Evolution',format:'Sleeved booster',language:'unknown',fulfilment_region_state:'DOMESTIC',retailer_country:'MX',ship_from_country:'MX',...overrides}))form.set(key,value);
    return handleFetch(new Request(`https://spawn.test/dashboard/verification/${asin}?access=test-board`,{method:'POST',body:form,headers:{accept:'application/json'}}),env);
  }
  it.each(['visibility_only','monitor'])('approves %s in one action with one inventory event',async(destination)=>{
    await verify();
    const response=await approveProduct(destination);expect(await response.json()).toMatchObject({ok:true});
    expect(db.prepare('SELECT status,language FROM monitoring_candidates WHERE retailer_sku=?').get(asin)).toMatchObject({status:'ACCEPTED',language:'unknown'});
    expect(db.prepare('SELECT lifecycle_status FROM amazon_watchlist WHERE asin=?').get(asin)?.lifecycle_status).toBe(destination==='monitor'?'PUBLISHED':'VERIFIED');
    const count=db.prepare('SELECT COUNT(*) n FROM customer_inventory_events').get()!.n;
    expect(await (await approveProduct(destination)).json()).toMatchObject({ok:true});
    expect(db.prepare('SELECT COUNT(*) n FROM customer_inventory_events').get()!.n).toBe(count);
  });
  it('blocks bad delivery, identity and stale evidence without publishing',async()=>{
    await verify();
    expect((await approveProduct('monitor',{ship_from_country:''})).status).toBe(400);
    expect(await (await approveProduct('monitor',{set_name:''})).json()).toMatchObject({ok:false,fields:{set_name:expect.any(String)}});
    expect(await (await approveProduct('monitor',{evidence_revision:'old'})).json()).toMatchObject({ok:false,error:expect.stringContaining('changed')});
    expect(db.prepare('SELECT COUNT(*) n FROM monitoring_candidates WHERE retailer_sku=?').get(asin)!.n).toBe(0);
  });
  it('does not approve a robot-blocked listing',async()=>{
    await verify(`Amazon Robot Check ${asin}`);
    expect(await (await approveProduct()).json()).toMatchObject({ok:false});
    expect(db.prepare('SELECT COUNT(*) n FROM amazon_catalog_decisions WHERE asin=?').get(asin)!.n).toBe(0);
  });
  it('refreshes stale verification without sending or queueing an approval request',async()=>{
    await verify();
    db.prepare('UPDATE amazon_verification_attempts SET completed_at=? WHERE asin=?').run(new Date(Date.now()-40*3_600_000).toISOString(),asin);
    const network=vi.fn(async()=>new Response(`Amazon ${asin}`));vi.stubGlobal('fetch',network);
    expect(await (await approveProduct()).json()).toMatchObject({ok:true});
    expect(network).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT COUNT(*) n FROM amazon_verification_attempts WHERE asin=?').get(asin)!.n).toBe(3);
    expect(db.prepare('SELECT COUNT(*) n FROM approval_notifications WHERE asin=?').get(asin)!.n).toBe(0);
  });
  it('serializes simultaneous combined submissions',async()=>{
    await verify();
    const responses=await Promise.all([approveProduct(),approveProduct()]);
    expect(responses.filter(response=>response.status===200)).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) n FROM listing_publication_decisions').get()!.n).toBe(1);
  });
  it.each(['spanish','japanese','unknown'])('preserves %s through resolution, approval, publication and delivery',async(language)=>{
    const before=db.prepare("SELECT asin,canonical_product_id FROM amazon_watchlist WHERE lifecycle_status='PUBLISHED' ORDER BY asin").all();
    await verify();
    expect(await reviewAmazonCandidate(env,asin,'approve',await reviewInput(),'admin')).toMatchObject({ok:false,error:'candidate_not_verified'});
    expect(await resolveAmazonIdentity(env,asin,resolution(language),'admin')).toMatchObject({ok:true});
    expect(db.prepare('SELECT method FROM amazon_verification_attempts WHERE asin=? ORDER BY id').all(asin)).toEqual([{method:'plain_fetch'},{method:'operator_resolution'}]);
    const input=await reviewInput();
    expect(await reviewAmazonCandidate(env,asin,'approve',input,'admin')).toMatchObject({ok:true});
    expect(await reviewAmazonCandidate(env,asin,'approve',input,'admin')).toMatchObject({ok:false});
    expect(await reviewAmazonCandidate(env,asin,'publish',input,'admin')).toMatchObject({ok:true});
    expect(await reviewAmazonCandidate(env,asin,'publish',input,'admin')).toMatchObject({ok:false});
    const response=await handleFetch(new Request('https://spawn.test/internal/garfield/amazon-watchlist',{headers:{authorization:'Bearer test-only-secret-for-local-rehearsal-1234'}}),env);
    const payload=await response.json() as {schema_version:number;watchlist:Array<Record<string,unknown>>};
    expect(payload.schema_version).toBe(2);
    const catalog=validatePublishedAmazonCatalog(payload);
    expect(catalog).not.toBeNull();
    const item=catalog!.find((item:{asin:string})=>item.asin===asin)!;
    expect(item.language).toBe(language);
    expect(db.prepare("SELECT asin,canonical_product_id FROM amazon_watchlist WHERE lifecycle_status='PUBLISHED' AND asin!=? ORDER BY asin").all(asin)).toEqual(before);
    const delivered:unknown[]=[],state=new Map<string,string>();
    vi.stubGlobal('fetch',vi.fn(async(url,init)=>{expect(String(url)).toBe('https://discord.test/fake');delivered.push(JSON.parse(init.body));return new Response(null,{status:204});}));
    const catchEnv={DISCORD_WEBHOOK_URL:'https://discord.test/fake',STATE:{get:async(key:string)=>state.get(key)??null,put:async(key:string,value:string)=>{state.set(key,value);}}};
    await announceNewCatalogTargets(catchEnv,[],[item]);
    expect(JSON.stringify(delivered)).toContain(languageLabel(language));
    await sendDiscord(catchEnv,{id:'fixture',name:item.product_name,retailer:'Amazon México',language,asin,url:item.product_url,routingKey:'pokemon-main'},'SOLD_OUT',{state:'BUYABLE',method:'fixture'},null,null);
    expect(JSON.stringify(delivered.at(-1))).toContain(languageLabel(language));
    const observation=await buildInventoryObservation({id:`amazon-${asin.toLowerCase()}`,source:'spawn-published-catalog',canonicalProductId:item.canonical_product_id,name:item.product_name,asin,url:item.product_url,routingKey:item.routing_key,watchCategory:item.watch_category},
      {checkedAt:new Date().toISOString(),observedState:'BUYABLE'},null,'direct_page');
    expect(observation).not.toBeNull();
    const body=JSON.stringify(observation),timestamp=String(Math.floor(Date.now()/1000));
    const signature=await hmacSha256Hex('test-only-secret-for-local-rehearsal-1234',`${timestamp}.${body}`);
    const received=await handleCatchInventoryObservation(new Request('https://spawn.test/internal/catch-inventory-observations',{method:'POST',body,headers:{'x-spawn-timestamp':timestamp,'x-spawn-signature':`sha256=${signature}`}}),env);
    expect(received.status).toBe(202);
    expect(await received.json()).toMatchObject({accepted:true,persisted:true,observation_id:observation!.observation_id});
    expect(db.prepare('SELECT observed_state FROM catch_inventory_observations WHERE observation_id=?').get(observation!.observation_id)).toMatchObject({observed_state:'BUYABLE_FEATURED'});
    expect(db.prepare('SELECT language,product_id FROM inventory WHERE retailer_sku=?').get(asin)).toMatchObject({language,product_id:null});
  });
  it('cannot resolve a blocked page or stale revision and requires explicit unknown-language acknowledgement',async()=>{
    await verify(`Amazon Robot Check ${asin}`);
    expect(await resolveAmazonIdentity(env,asin,resolution(),'admin')).toMatchObject({ok:false,error:'verification_required'});
    await verify();
    const input=resolution();
    expect(await resolveAmazonIdentity(env,asin,{...input,evidenceRevision:'old'},'admin')).toMatchObject({ok:false,error:'stale_evidence'});
    expect(await resolveAmazonIdentity(env,asin,{...input,language:'unknown',acknowledgeUnknown:false},'admin')).toMatchObject({ok:false,error:'identity_evidence_required'});
    expect(await resolveAmazonIdentity(env,asin,input,'admin',new Date(Date.now()+37*3_600_000))).toMatchObject({ok:false,error:'verification_required'});
    expect(db.prepare('SELECT COUNT(*) count FROM amazon_catalog_decisions WHERE asin=?').get(asin)).toMatchObject({count:0});
  });
  it('rejects invalid routes without approving a product',async()=>{
    await verify();await resolveAmazonIdentity(env,asin,resolution(),'admin');
    expect(await reviewAmazonCandidate(env,asin,'approve',{...await reviewInput(),routingKey:'delta-reign'},'admin')).toMatchObject({ok:false,error:'incomplete_approval'});
  });
  it('records concurrent approval/publication only once and increments the catalog once',async()=>{
    await verify();await resolveAmazonIdentity(env,asin,resolution(),'admin');
    const input=await reviewInput();
    const approvals=await Promise.all([reviewAmazonCandidate(env,asin,'approve',input,'one'),reviewAmazonCandidate(env,asin,'approve',input,'two')]);
    expect(approvals.filter(result=>result.ok)).toHaveLength(1);
    const before=Number(db.prepare("SELECT value FROM worker_state WHERE key='amazon_catalog_version'").get()?.value??0);
    const publications=await Promise.all([reviewAmazonCandidate(env,asin,'publish',input,'one'),reviewAmazonCandidate(env,asin,'publish',input,'two')]);
    expect(publications.filter(result=>result.ok)).toHaveLength(1);
    expect(Number(db.prepare("SELECT value FROM worker_state WHERE key='amazon_catalog_version'").get()!.value)).toBe(before+1);
    expect(db.prepare('SELECT COUNT(*) count FROM amazon_catalog_decisions WHERE asin=?').get(asin)).toMatchObject({count:2});
  });
  it('clears an English pricing identity when the same listing is corrected to Spanish',async()=>{
    const stamp=new Date().toISOString();
    db.prepare("INSERT INTO scan_runs(id,started_at,trigger_source,status,config_version,model) VALUES('test',?,'manual','running','test','test')").run(stamp);
    const listing={title:'Ascended Heroes Elite Trainer Box',watch_category:'ascended_heroes' as const,retailer:'Test store',retailer_sku:'test',url:'https://store.test/product',status:'sold_out' as const,price_mxn:null,language:'english' as const,language_evidence:'Fixture packaging',msrp_mxn:null,msrp_source_url:null,evidence:'Fixture'};
    await updateInventory(env,'test',[listing],stamp);
    expect(db.prepare('SELECT product_id FROM inventory WHERE canonical_url=?').get(listing.url)).toMatchObject({product_id:'ah-en-etb'});
    db.prepare("INSERT INTO scan_runs(id,started_at,trigger_source,status,config_version,model) VALUES('test2',?,'manual','running','test','test')").run(stamp);
    await updateInventory(env,'test2',[{...listing,language:'spanish'}],stamp);
    expect(db.prepare('SELECT language,product_id FROM inventory WHERE canonical_url=?').get(listing.url)).toMatchObject({language:'spanish',product_id:null});
  });
  it('retries failed Discord delivery and suppresses a repeated successful tracking notice',async()=>{
    const item={asin,canonical_product_id:'fixture-es',language:'spanish',product_name:'Fixture',routing_key:'pokemon-main',product_url:`https://www.amazon.com.mx/dp/${asin}`,lane:'normal'};
    const state=new Map<string,string>(),catchEnv={DISCORD_WEBHOOK_URL:'https://discord.test/fake',STATE:{get:async(key:string)=>state.get(key)??null,put:async(key:string,value:string)=>{state.set(key,value);}}};
    const failed=await announceNewCatalogTargets(catchEnv,[],[item],{fetchFn:async()=>new Response(null,{status:500})});
    expect(failed[0].status).toBe('pending-delivery');
    let attempts=0;
    const options={fetchFn:async()=>{attempts++;return new Response(null,{status:204});}};
    await announceNewCatalogTargets(catchEnv,[],[item],options);
    await announceNewCatalogTargets(catchEnv,[],[item],options);
    expect(attempts).toBe(1);
  });
});
