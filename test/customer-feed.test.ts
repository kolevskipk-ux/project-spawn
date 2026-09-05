import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {generateKeyPair,SignJWT} from 'jose';
import feed,{customerInventory} from '../src/customer-feed';
import customer,{type CustomerEnv} from '../src/customer';
import {handleFetch} from '../src/index';
import type {Env} from '../src/types';
const keys=vi.hoisted(()=>({publicKey:undefined as unknown}));
vi.mock('jose',async original=>({...await original<typeof import('jose')>(),createRemoteJWKSet:()=>async()=>keys.publicKey}));
let db:DatabaseSync,ops:Env,customers:CustomerEnv,privateKey:CryptoKey;
const owner='owner@example.test',admin='admin@example.test',viewer='viewer@example.test',buyer='buyer@example.test',id='12345678-1234-1234-1234-123456789012',issuer='https://feed-test.cloudflareaccess.com';
function adapter(){const prepare=(sql:string)=>{let params:unknown[]=[];return {bind(...v:unknown[]){params=v;return this;},first:async()=>db.prepare(sql).get(...params as never[])??null,all:async()=>({results:db.prepare(sql).all(...params as never[])}),run:async()=>{const r=db.prepare(sql).run(...params as never[]);return {success:true,meta:{changes:Number(r.changes)}};},read:async()=>({results:db.prepare(sql).all(...params as never[])})}};return {prepare,batch:async(statements:ReturnType<typeof prepare>[])=>{db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.read());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}} as unknown as D1Database;}
async function request(path:string,email=owner,form?:Record<string,string>,origin='https://ops.example.test',audience='operations'){
 const jwt=await new SignJWT({email}).setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setAudience(audience).setSubject(email).setIssuedAt().setExpirationTime('1h').sign(privateKey);
 return new Request(`https://ops.example.test${path}`,{method:form?'POST':'GET',headers:{'Cf-Access-Jwt-Assertion':jwt,origin},...(form?{body:new URLSearchParams(form)}:{})});
}
const list=(query='')=>customerInventory({SPAWN_DB:ops.SPAWN_DB},new URL('https://source/inventory'+query));
beforeAll(async()=>{const pair=await generateKeyPair('RS256');keys.publicKey=pair.publicKey;privateKey=pair.privateKey;});
beforeEach(()=>{
 db=new DatabaseSync(':memory:');for(const directory of ['migrations','customer-migrations'])for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(`${directory}/${name}`,'utf8'));
 db.exec(readFileSync('scripts/seed-customer-source-staging.sql','utf8'));
 const storage=adapter();ops={SPAWN_DB:storage,CUSTOMER_DB:storage,OPS_AUTH_MODE:'access',OPS_ACCESS_ISSUER:issuer,OPS_ACCESS_AUD:'operations',OPS_OWNER_EMAIL:owner,OPS_ENVIRONMENT:'Staging'} as unknown as Env;
 customers={CUSTOMER_DB:storage,CUSTOMER_ACCESS_ISSUER:issuer,CUSTOMER_ACCESS_AUD:'customers',CUSTOMER_ENVIRONMENT:'Staging',CUSTOMER_INVENTORY_MODE:'source',CUSTOMER_SOURCE:{fetch:(url:string,init?:RequestInit)=>feed.fetch(new Request(url,init),{SPAWN_DB:storage})} as unknown as Fetcher};
 db.prepare("INSERT INTO customer_members(id,email,status,created_at) VALUES(?,?,'ACTIVE',?)").run(id,buyer,new Date().toISOString());
 for(const [email,role] of [[admin,'admin'],[viewer,'viewer']])db.prepare("INSERT INTO ops_members VALUES(?,?,'ACTIVE',?,?)").run(email,role,new Date().toISOString(),owner);
});
afterEach(()=>db.close());
describe('approved customer publication feed',()=>{
 it('exposes only published projection fields and supports combined filters',async()=>{
  db.exec("UPDATE monitoring_candidates SET status='PENDING' WHERE source_listing_key='customer-pilot-demo-4'");
  const result=await list();expect(result.rows).toHaveLength(3);expect(Object.keys(result.rows[0]).sort()).toEqual(['id','title','set_name','retailer','language','price_mxn','availability','observed_at'].sort());
  const filtered=await list('?store=Demo+Cards&availability=available');expect(filtered.rows.map(r=>r.title)).toEqual(['Sample Elite Trainer Box']);
  expect((await list('?q=%27+OR+1%3D1--')).rows).toHaveLength(0);
 });
 it('shows source price updates and removes withdrawals without a copy or sync job',async()=>{
  expect((await list('?q=Elite')).rows[0].price_mxn).toBe(1299);
  db.exec("UPDATE inventory SET price_mxn=1199 WHERE listing_key='customer-pilot-demo-1'");
  expect((await list('?q=Elite')).rows[0].price_mxn).toBe(1199);
  db.exec("INSERT INTO listing_publication_decisions(candidate_id,decision,reason,decided_by,decided_at) VALUES('"+'c1'.repeat(32)+"','REJECTED','Withdrawn for test','test',CURRENT_TIMESTAMP)");
  expect((await list('?q=Elite')).rows).toHaveLength(0);
 });
 it('suppresses archived inventory, unconfirmed shipping and expired destination evidence',async()=>{
  db.exec("INSERT INTO inventory_revalidation_state(listing_key,lifecycle_state,due_at,next_eligible_at,updated_at) VALUES('customer-pilot-demo-1','ARCHIVED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  expect((await list('?q=Elite')).rows).toHaveLength(0);
  db.exec("UPDATE inventory SET fulfilment_region_state='CROSS_BORDER_CONFIRMED',destination_fresh_until='2000-01-01' WHERE listing_key='customer-pilot-demo-2'");
  db.exec("UPDATE inventory SET fulfilment_region_state='CROSS_BORDER_UNVERIFIED' WHERE listing_key='customer-pilot-demo-3'");
  expect((await list()).rows.map(r=>r.id)).toEqual(['customer-pilot-demo-4']);
 });
 it('requires current trustworthy timestamps and verified prices',async()=>{
  db.exec("UPDATE inventory SET availability_observed_at='2000-01-01',pricing_observed_at='2000-01-01' WHERE listing_key='customer-pilot-demo-1'");
  expect((await list('?q=Elite')).rows[0]).toMatchObject({price_mxn:null,availability:'unknown'});
  db.exec("UPDATE inventory SET price_verification_status='PENDING' WHERE listing_key='customer-pilot-demo-2'");expect((await list('?q=Bundle')).rows[0].price_mxn).toBeNull();
  db.exec("UPDATE inventory SET availability_freshness_status='REVALIDATION_PENDING' WHERE listing_key='customer-pilot-demo-3'");expect((await list('?q=Anniversary')).rows[0].availability).toBe('unknown');
  db.exec("UPDATE inventory SET availability_observed_at='2099-01-01' WHERE listing_key='customer-pilot-demo-4'");expect((await list('?q=Collector')).rows[0].availability).toBe('unknown');
 });
 it('accepts independently revalidated prices without relying on Amazon enrichment flags',async()=>{
  db.exec("UPDATE inventory SET price_verification_status='PENDING' WHERE listing_key='customer-pilot-demo-1'");
  const now=new Date().toISOString();
  db.prepare("INSERT INTO inventory_revalidation_attempts(attempt_id,listing_key,domain,started_at,finished_at,outcome,http_status,parser_version,observed_price_mxn,evidence) VALUES('price-test','customer-pilot-demo-1','example.com',?,?,'AVAILABLE',200,'test',1099,'Test evidence')").run(now,now);
  expect((await list('?q=Elite')).rows[0].price_mxn).toBe(1099);
 });
 it('renders through the private feed and fails closed rather than falling back to sample inventory',async()=>{
  const html=await (await customer.fetch(await request('/app',buyer,undefined,undefined,'customers'),customers)).text();expect(html).toContain('Sample Elite Trainer Box');
  customers.CUSTOMER_SOURCE={fetch:async()=>new Response('unavailable',{status:503})} as unknown as Fetcher;
  const failed=await customer.fetch(await request('/app',buyer,undefined,undefined,'customers'),customers);expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('Sample Elite Trainer Box');
 });
});
describe('customer access management',()=>{
 it('lets paused customers request help while protecting the support queue and forms',async()=>{
  db.exec("UPDATE customer_members SET status='REVOKED',updated_by='test',updated_at=CURRENT_TIMESTAMP,change_reason='Test pause'");
  expect((await customer.fetch(await request('/app',buyer,undefined,undefined,'customers'),customers)).status).toBe(403);
  expect((await customer.fetch(await request('/app/support',buyer,undefined,undefined,'customers'),customers)).status).toBe(200);
  const form={kind:'account_removal',message:'<script>please remove</script>'};
  expect((await customer.fetch(await request('/app/support',buyer,form,'https://attacker.test','customers'),customers)).status).toBe(403);
  expect((await customer.fetch(await request('/app/support',buyer,form,undefined,'customers'),customers)).status).toBe(303);
  expect(db.prepare('SELECT count(*) n FROM customer_support').get()?.n).toBe(1);
  for(const who of [viewer,buyer])expect((await handleFetch(await request('/ops/customer-support',who),ops)).status).toBe(403);
  const response=await handleFetch(await request('/ops/customer-support',admin),ops),html=await response.text();
  expect(response.status).toBe(200);expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>please');
  const ticket=String(db.prepare('SELECT id FROM customer_support').get()?.id);
  expect((await handleFetch(await request('/ops/customer-support',admin,{id:ticket},'https://attacker.test'),ops)).status).toBe(403);
  expect((await handleFetch(await request('/ops/customer-support',admin,{id:ticket}),ops)).status).toBe(303);
 });
 it('allows admins to pause and restore customers with immutable audit and immediate enforcement',async()=>{
  expect(await (await handleFetch(await request('/ops/customers',admin),ops)).text()).toContain(buyer);
  const form={id,status:'REVOKED',version:'0',reason:'Pilot access paused'};
  expect((await handleFetch(await request('/ops/customers',admin,form),ops)).status).toBe(303);
  expect((await customer.fetch(await request('/app',buyer,undefined,undefined,'customers'),customers)).status).toBe(403);
  expect(db.prepare('SELECT status,decided_by,reason FROM customer_access_decisions').get()).toMatchObject({status:'REVOKED',decided_by:admin,reason:form.reason});
  expect((await handleFetch(await request('/ops/customers',owner,{...form,status:'ACTIVE',version:'1',reason:'Pilot resumed'}),ops)).status).toBe(303);
  expect((await customer.fetch(await request('/app',buyer,undefined,undefined,'customers'),customers)).status).toBe(200);
  expect(db.prepare('SELECT count(*) n FROM customer_access_decisions').get()?.n).toBe(2);
  expect(db.prepare('SELECT * FROM ops_members WHERE email=?').get(buyer)).toBeUndefined();
 });
 it('rejects stale forms, viewer/customer access, CSRF and missing reasons',async()=>{
  const form={id,status:'REVOKED',version:'0',reason:'Pause'};
  expect((await handleFetch(await request('/ops/customers',viewer),ops)).status).toBe(403);
  expect((await handleFetch(await request('/ops/customers',buyer,undefined,undefined,'customers'),ops)).status).toBe(403);
  expect((await handleFetch(await request('/ops/customers',admin,form,'https://attacker.test'),ops)).status).toBe(403);
  expect((await handleFetch(await request('/ops/customers',admin,{...form,reason:''}),ops)).status).toBe(400);
  await handleFetch(await request('/ops/customers',admin,form),ops);
  expect((await handleFetch(await request('/ops/customers',owner,{...form,status:'ACTIVE'}),ops)).status).toBe(409);
  expect(db.prepare('SELECT count(*) n FROM customer_access_decisions').get()?.n).toBe(1);
 });
});
