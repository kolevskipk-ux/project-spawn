import * as legal from '../src/customer-legal';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {generateKeyPair,SignJWT} from 'jose';
import worker,{customerFetch,type CustomerEnv} from '../src/customer';
const keys=vi.hoisted(()=>({publicKey:undefined as unknown}));
vi.mock('jose',async original=>({...await original<typeof import('jose')>(),createRemoteJWKSet:()=>async()=>keys.publicKey}));
let db:DatabaseSync, env:CustomerEnv, privateKey:CryptoKey;
const issuer='https://test.cloudflareaccess.com';
function adapter(){return {prepare(sql:string){let params:unknown[]=[];return {bind(...values:unknown[]){params=values;return this;},first:async()=>db.prepare(sql).get(...params as never[])??null,all:async()=>({results:db.prepare(sql).all(...params as never[])}),run:async()=>db.prepare(sql).run(...params as never[])}}} as unknown as D1Database;}
async function request(path='/app',email='customer@example.test',options:{method?:string;origin?:string;claims?:Record<string,unknown>}={}){
 const token=await new SignJWT({email,iss:issuer,aud:'customers',sub:email,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...options.claims}).setProtectedHeader({alg:'RS256'}).sign(privateKey);
 return new Request(`https://customers.example.test${path}`,{method:options.method??'GET',headers:{'Cf-Access-Jwt-Assertion':token,origin:options.origin??'https://customers.example.test','content-type':'application/x-www-form-urlencoded'}});
}
async function join(email='customer@example.test'){return customerFetch(await request('/app/join',email,{method:'POST'}),env);}
beforeAll(async()=>{const pair=await generateKeyPair('RS256');keys.publicKey=pair.publicKey;privateKey=pair.privateKey;});
beforeEach(()=>{db=new DatabaseSync(':memory:');db.exec(readFileSync('customer-migrations/0001_customer_pilot.sql','utf8'));db.exec(readFileSync('scripts/seed-customer-staging.sql','utf8'));env={CUSTOMER_DB:adapter(),CUSTOMER_ACCESS_ISSUER:issuer,CUSTOMER_ACCESS_AUD:'customers',CUSTOMER_ENVIRONMENT:'Staging · sample data'};});
afterEach(()=>{vi.restoreAllMocks();db.close();});
describe('customer pilot isolation',()=>{
 it('permits the Discord OAuth form redirect while rejecting cross-origin link submissions',async()=>{
  db.exec(readFileSync('customer-migrations/0004_discord_membership.sql','utf8'));
  await join();
  Object.assign(env,{DISCORD_APPLICATION_ID:'1537592665535942711',DISCORD_GUILD_ID:'1537592665535942709',DISCORD_CLIENT_SECRET:'fixture',DISCORD_BOT_TOKEN:'fixture',DISCORD_REDIRECT_URI:'https://customers.example.test/app/discord/callback'});
  const onboarding=await customerFetch(await request('/app/onboarding'),env);
  expect(onboarding.headers.get('content-security-policy')).toContain("form-action 'self' https://discord.com;");
  expect((await customerFetch(await request('/app/discord/start',undefined,{method:'POST',origin:'https://attacker.test'}),env)).status).toBe(403);
  const response=await customerFetch(await request('/app/discord/start',undefined,{method:'POST'}),env);
  expect(response.status).toBe(303);
  const destination=new URL(response.headers.get('location')!);
  expect(destination.origin+destination.pathname).toBe('https://discord.com/oauth2/authorize');
  expect(destination.searchParams.get('scope')).toBe('identify');
  expect(destination.searchParams.get('state')).toBeTruthy();
 });
 it('requires terms only for new accounts and never revokes existing members for non-acknowledgment',async()=>{
  db.exec(readFileSync('customer-migrations/0004_discord_membership.sql','utf8'));
  await join();
  env.CUSTOMER_TERMS_REQUIRED_FROM='2026-09-10T00:47:12.000Z';env.CUSTOMER_TERMS_VERSION='release-test';
  db.prepare('UPDATE customer_members SET created_at=?').run('2026-09-09T00:00:00.000Z');
  expect((await customerFetch(await request(),env)).status).toBe(200);
  expect(db.prepare('SELECT status FROM customer_members').get()?.status).toBe('ACTIVE');
  db.prepare('UPDATE customer_members SET created_at=?').run('2026-09-10T00:47:12.000Z');
  expect((await customerFetch(await request(),env)).headers.get('location')).toBe('/app/onboarding');
  expect((await customerFetch(await request('/app/support'),env)).status).toBe(200);
  const id=String(db.prepare('SELECT id FROM customer_members').get()?.id);
  db.prepare('INSERT INTO customer_terms_acceptances VALUES(?,?,?,1)').run(id,'release-test',new Date().toISOString());
  expect((await customerFetch(await request(),env)).status).toBe(200);
  expect(db.prepare('SELECT status FROM customer_members').get()?.status).toBe('ACTIVE');
 });
 it('gates inventory behind membership and explicit adult/terms acceptance without hiding account help',async()=>{
  db.exec(readFileSync('customer-migrations/0004_discord_membership.sql','utf8'));
  await join();env.CUSTOMER_MEMBERSHIP_MODE='enforced';
  expect((await customerFetch(await request(),env)).headers.get('location')).toBe('/app/onboarding');
  expect((await customerFetch(await request('/app/account'),env)).status).toBe(200);
  expect((await customerFetch(await request('/app/support'),env)).status).toBe(200);
  const id=String(db.prepare('SELECT id FROM customer_members WHERE email=?').get('customer@example.test')?.id);
  Object.assign(env,{DISCORD_GUILD_ID:'1537592665535942709',DISCORD_BOT_TOKEN:'fixture',DISCORD_FREE_ACCESS_ENABLED:'true',CUSTOMER_LEGAL_PUBLISHED:'true',CUSTOMER_OPERATOR_NAME:'Test operator',CUSTOMER_OPERATOR_ADDRESS:'Test address',CUSTOMER_PRIVACY_EMAIL:'privacy@example.test',CUSTOMER_TERMS_VERSION:'v1',CUSTOMER_TERMS_EFFECTIVE_DATE:'2026-09-09'});
  db.prepare("INSERT INTO customer_discord_links(customer_id,discord_user_id,guild_id,linked_at,membership_status,checked_at,verified_at) VALUES(?,?,?,?,'MEMBER',?,?)").run(id,'1537592665535942710',env.DISCORD_GUILD_ID!, new Date().toISOString(),new Date().toISOString(),new Date().toISOString());
  const accept=async(adult:string,origin='https://customers.example.test')=>customerFetch(new Request(await request('/app/terms',undefined,{method:'POST',origin}),{body:new URLSearchParams({terms:'yes',adult,version:'v1'})}),env);
  expect((await accept('no')).status).toBe(400);
  expect((await accept('yes','https://attacker.test')).status).toBe(403);
  expect(db.prepare('SELECT COUNT(*) n FROM customer_terms_acceptances').get()?.n).toBe(0);
  // The bundled candidate must remain unavailable even with publication configured.
  expect((await accept('yes')).status).toBe(400);
  // Exercise receipt/access behavior independently of the unapproved document bundle.
  vi.spyOn(legal,'legalReady').mockReturnValue(true);
  expect((await accept('yes')).status).toBe(303);
  expect((await customerFetch(await request(),env)).status).toBe(200);
  env.CUSTOMER_TERMS_VERSION='v2';expect((await customerFetch(await request(),env)).headers.get('location')).toBe('/app/onboarding');
 });
 it('has a public landing but never exposes listings without a verified customer JWT',async()=>{
  expect((await customerFetch(new Request('https://customers.example.test/'),env)).status).toBe(200);
  for(const headers of [{},{'Cf-Access-Authenticated-User-Email':'customer@example.test'},{'Cf-Access-Jwt-Assertion':'fake'}] as Record<string,string>[] )expect((await customerFetch(new Request('https://customers.example.test/app',{headers}),env)).status).toBe(401);
  for(const claims of [{aud:'operations'},{iss:'https://wrong.cloudflareaccess.com'},{exp:1},{email:''}])expect((await customerFetch(await request('/app',undefined,{claims}),env)).status).toBe(401);
 });
 it('requires explicit same-origin registration and normalizes verified email',async()=>{
  expect(await (await customerFetch(await request(),env)).text()).toContain('Create your account');
  expect(db.prepare('SELECT count(*) n FROM customer_members').get()?.n).toBe(0);
  expect((await customerFetch(await request('/app/join',undefined,{method:'POST',origin:'https://attacker.test'}),env)).status).toBe(403);
  expect((await join('Customer@Example.Test')).status).toBe(303);
  expect((await join()).status).toBe(303);
  expect(db.prepare('SELECT email FROM customer_members').all()).toEqual([{email:'customer@example.test'}]);
 });
 it('does not recreate revoked accounts and checks access on every request',async()=>{
  await join(); db.exec("UPDATE customer_members SET status='REVOKED'");
  expect((await customerFetch(await request(),env)).status).toBe(403);
  expect((await join()).status).toBe(403);
  expect(db.prepare('SELECT status FROM customer_members').get()?.status).toBe('REVOKED');
 });
 it('only renders published listings and filters with bound parameters',async()=>{
  await join();
  let html=await (await customerFetch(await request(),env)).text();
  expect(html).toContain('Sample Elite Trainer Box');expect(html).not.toContain('Unapproved internal sample');expect(html).not.toContain('Hidden set');
  html=await (await customerFetch(await request('/app?store=Demo+Cards&availability=available'),env)).text();
  expect(html).toContain('Sample Elite Trainer Box');expect(html).not.toContain('Sample Collector Box');
  html=await (await customerFetch(await request('/app?q=%27+OR+1%3D1--'),env)).text();expect(html).toContain('No listings match');
  db.exec("UPDATE customer_listings SET publication_state='WITHDRAWN' WHERE id='demo-1'");
  expect(await (await customerFetch(await request(),env)).text()).not.toContain('Sample Elite Trainer Box');
 });
 it('denies admin, machine, export routes and inventory writes even to a signed-in customer',async()=>{
  await join();
  for(const path of ['/ops','/approvals','/inventory.csv','/app/export.pdf','/internal/garfield/vendors','/dashboard'])expect((await customerFetch(await request(path),env)).status).toBe(404);
  expect((await customerFetch(await request('/app',undefined,{method:'POST'}),env)).status).toBe(405);
 });
 it('escapes data and uses an individual watermark without leaking another email',async()=>{
  await join();await join('second@example.test');
  db.exec("UPDATE customer_listings SET title='<script>alert(1)</script>' WHERE id='demo-1'");
  const res=await customerFetch(await request(),env),html=await res.text();
  expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('second@example.test');
  const member=db.prepare('SELECT id FROM customer_members WHERE email=?').get('customer@example.test');expect(html).toContain(String(member?.id).slice(0,12));
  expect(res.headers.get('cache-control')).toContain('no-store');expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
 });
 it('throttles verified customers and returns generic storage errors',async()=>{
  await join();db.prepare('UPDATE customer_rate_limits SET requests=120,window=?').run(Math.floor(Date.now()/60000));
  const res=await customerFetch(await request(),env);expect(res.status).toBe(429);expect(res.headers.get('retry-after')).toBe('60');
  db.exec('DROP TABLE customer_members');db.exec('DELETE FROM customer_rate_limits');
  const failure=await worker.fetch(await request(),env);expect(failure.status).toBe(503);expect(await failure.text()).not.toContain('customer_members');
 });
});
