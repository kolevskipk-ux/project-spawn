import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {generateKeyPair,SignJWT} from 'jose';
import {handleFetch} from '../src/index';
import {runAmazonVerification} from '../src/verification';
import type {Env} from '../src/types';

const keys=vi.hoisted(()=>({publicKey:undefined as unknown}));
vi.mock('jose',async original=>({...await original<typeof import('jose')>(),createRemoteJWKSet:()=>async()=>keys.publicKey}));
let sqlite:DatabaseSync,env:Env,privateKey:CryptoKey;
const owner='owner@example.test',admin='admin@example.test',issuer='https://workflow-test.cloudflareaccess.com',candidate='a'.repeat(64);
function adapter(db:DatabaseSync){
  const prepare=(sql:string)=>{
    let values:unknown[]=[];
    const query=()=>db.prepare(sql);
    return {bind(...params:unknown[]){values=params;return this;},async first(){return query().get(...values as never[])??null;},async all(){return {results:query().all(...values as never[]),success:true};},async run(){const result=query().run(...values as never[]);return {success:true,meta:{changes:Number(result.changes)}};}};
  };
  return {prepare,async batch(statements:Array<{run:()=>Promise<unknown>}>){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
async function request(path:string,email=owner,form?:Record<string,string>){
  const jwt=await new SignJWT({email}).setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setAudience('operations').setSubject(email).setIssuedAt().setExpirationTime('1h').sign(privateKey);
  return new Request(`https://ops.example.test${path}`,{method:form?'POST':'GET',headers:{'Cf-Access-Jwt-Assertion':jwt,origin:'https://ops.example.test'},...(form?{body:new URLSearchParams(form)}:{})});
}
beforeAll(async()=>{const pair=await generateKeyPair('RS256');keys.publicKey=pair.publicKey;privateKey=pair.privateKey;});
beforeEach(()=>{
  sqlite=new DatabaseSync(':memory:');
  for(const name of readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort())sqlite.exec(readFileSync(`migrations/${name}`,'utf8'));
  env={SPAWN_DB:adapter(sqlite),OPS_AUTH_MODE:'access',OPS_OWNER_EMAIL:owner,OPS_ACCESS_ISSUER:issuer,OPS_ACCESS_AUD:'operations',OPS_ENVIRONMENT:'Test',SPAWN_TIMEZONE:'America/Mexico_City',SPAWN_CONFIG_VERSION:'test',BOARD_ACCESS_TOKEN:'never-expose-this'} as unknown as Env;
  sqlite.prepare("INSERT INTO monitoring_candidates(candidate_id,source,source_url,source_listing_key,vendor,vendor_key,product_name,product_family,print_series,language,discovered_at,review_eligible) VALUES(?,'test','https://example.test/item','sample-listing','Sample vendor','sample-vendor','Sample listing','pokemon_tcg','Delta Reign','english',?,1)").run(candidate,new Date().toISOString());
});
afterEach(()=>sqlite.close());

describe('operations workflow against the complete schema',()=>{
  it('preserves administrator identity through combined publication and returns field errors as JSON',async()=>{
    const asin='B0H27L3TKW',now=new Date().toISOString();
    sqlite.prepare("INSERT INTO amazon_watchlist(asin,product_name,product_url,watch_category,language,source,first_discovered_at,last_discovered_at,updated_at) VALUES(?,?,?,'pokemon_tcg','unknown','test',?,?,?)")
      .run(asin,'Mega Evolution sleeve booster',`https://www.amazon.com.mx/dp/${asin}`,now,now,now);
    await runAmazonVerification(env,asin,owner,async()=>new Response(`Amazon ${asin}`));
    // This adapter does not expose last_row_id; bind the fixture's immutable attempt explicitly.
    sqlite.prepare('UPDATE amazon_watchlist SET verification_attempt_id=(SELECT MAX(id) FROM amazon_verification_attempts WHERE asin=?) WHERE asin=?').run(asin,asin);
    const revision=String(sqlite.prepare('SELECT evidence_revision FROM amazon_watchlist WHERE asin=?').get(asin)!.evidence_revision);
    const form={action:'approve_product',evidence_revision:revision,product_name:'Mega Evolution sleeve booster',set_name:'Mega Evolution',format:'Sleeved booster',language:'unknown',destination:'monitor',fulfilment_region_state:'DOMESTIC',retailer_country:'MX',ship_from_country:'MX'};
    const invalid=await request(`/dashboard/verification/${asin}`,owner,{...form,set_name:''});invalid.headers.set('accept','application/json');
    expect(await (await handleFetch(invalid,env)).json()).toMatchObject({ok:false,fields:{set_name:expect.any(String)}});
    const valid=await request(`/dashboard/verification/${asin}`,owner,form);valid.headers.set('accept','application/json');
    const result=await handleFetch(valid,env);expect(await result.json()).toMatchObject({ok:true});
    expect(sqlite.prepare('SELECT decided_by FROM listing_publication_decisions ORDER BY id DESC LIMIT 1').get()).toMatchObject({decided_by:owner});
    expect(sqlite.prepare("SELECT COUNT(*) n FROM amazon_catalog_decisions WHERE asin=? AND decided_by=?").get(asin,owner)!.n).toBe(2);
  });
  it('renders every operator page with real queries and no shared secret',async()=>{
    for(const path of ['/ops','/approvals','/inventory','/dashboard','/ops/people','/ops/account','/ops/activity','/ops/vendors','/ops/health']){
      const res=await handleFetch(await request(path),env);const html=await res.text();
      expect(res.headers.get('referrer-policy'),path).toBe('same-origin');
      expect(res.status,path).toBe(200);expect(html,path).not.toContain('never-expose-this');expect(html,path).not.toContain('?access=');expect(html,path).toContain('GARFIELD');
    }
  });
  it('grants a second administrator access, records their decision, then revokes their existing session',async()=>{
    expect((await handleFetch(await request('/ops',admin),env)).status).toBe(403);
    expect((await handleFetch(await request('/ops/people',owner,{email:admin,role:'admin',status:'ACTIVE',reason:'Help with reviews'}),env)).status).toBe(303);
    expect((await handleFetch(await request('/approvals',admin),env)).status).toBe(200);
    expect((await handleFetch(await request(`/dashboard/listing/${candidate}`,admin,{action:'reject',reason:'Identity is incomplete'}),env)).status).toBe(303);
    expect(sqlite.prepare('SELECT decided_by,reason FROM listing_publication_decisions').get()).toMatchObject({decided_by:admin,reason:'Identity is incomplete'});
    expect(await (await handleFetch(await request('/ops/activity'),env)).text()).toContain('Identity is incomplete');
    await handleFetch(await request('/ops/people',owner,{email:admin,role:'admin',status:'REVOKED',reason:'End of pilot'}),env);
    expect((await handleFetch(await request('/inventory',admin),env)).status).toBe(403);
  });
  it('allows only one decision when two administrators act on the same listing',async()=>{
    sqlite.prepare("INSERT INTO ops_members VALUES(?,'admin','ACTIVE',?,?)").run(admin,new Date().toISOString(),owner);
    const requests=await Promise.all([request(`/dashboard/listing/${candidate}`,owner,{action:'reject',reason:'Owner review'}),request(`/dashboard/listing/${candidate}`,admin,{action:'reject',reason:'Admin review'})]);
    const results=await Promise.all(requests.map(r=>handleFetch(r,env)));
    expect(results.filter(r=>r.status===303)).toHaveLength(1);
    expect(results.some(r=>r.status===409||r.status===404)).toBe(true);
    expect(sqlite.prepare('SELECT COUNT(*) count FROM listing_publication_decisions').get()).toMatchObject({count:1});
    expect(sqlite.prepare('SELECT COUNT(*) count FROM ops_review_locks').get()).toMatchObject({count:0});
  });
});
