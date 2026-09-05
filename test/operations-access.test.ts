import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {generateKeyPair, SignJWT} from 'jose';
import type {Env} from '../src/types';
import {authenticateOperator, mutationAllowed} from '../src/operations-auth';
import {operationsRoute, wrapExistingPage} from '../src/operations';
import {renderApprovals} from '../src/dashboard';
import {handleFetch} from '../src/index';

const keys = vi.hoisted(()=>({publicKey: undefined as unknown}));
vi.mock('jose', async original => ({...await original<typeof import('jose')>(),createRemoteJWKSet:()=>async()=>keys.publicKey}));
const review = vi.hoisted(()=>vi.fn(async()=>({ok:true})));
vi.mock('../src/verification', async original=>({...await original<typeof import('../src/verification')>(),reviewAmazonCandidate:review}));
let privateKey: CryptoKey;
const issuer='https://garfield-test.cloudflareaccess.com';
const owner={email:'owner@example.test',subject:'owner-subject',role:'owner' as const};
const viewer={email:'viewer@example.test',subject:'viewer-subject',role:'viewer' as const};
let member: {role:string}|null;
let writes: unknown[][];
function environment():Env {
  const db={prepare:(sql:string)=>{
    let params:unknown[]=[];
    return {bind(...values:unknown[]){params=values;return this;},first:async()=>sql.includes('ops_members')?member:sql.includes('amazon_watchlist')?{lifecycle_status:'VERIFIED'}:null,all:async()=>({results:[]}),run:async()=>{writes.push(params);return {success:true,meta:{changes:1}};},sql,get params(){return params;}};
  },batch:async(statements:Array<{params:unknown[]}>)=>{writes.push(...statements.map(s=>s.params));return [];}};
  return {OPS_AUTH_MODE:'access',OPS_ACCESS_ISSUER:issuer,OPS_ACCESS_AUD:'ops-audience',OPS_OWNER_EMAIL:owner.email,OPS_ENVIRONMENT:'Staging',BOARD_ACCESS_TOKEN:'old-shared-secret',SPAWN_DB:db} as unknown as Env;
}
async function token(email=owner.email, overrides:Record<string,unknown>={}) {
  return new SignJWT({email,...overrides}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(issuer).setAudience('ops-audience').setSubject('test-subject').setIssuedAt().setExpirationTime('1h').sign(privateKey);
}
const request=(path:string,jwt:string,init:RequestInit={})=>new Request(`https://ops.example.test${path}`,{...init,headers:{'Cf-Access-Jwt-Assertion':jwt,...init.headers}});
beforeAll(async()=>{const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;keys.publicKey=pair.publicKey;});
beforeEach(()=>{member=null;writes=[];review.mockClear();});

describe('individual operations access',()=>{
  it('rejects old shared links, spoofed identity headers and direct origin requests without a signed JWT',async()=>{
    for(const path of ['/ops','/dashboard','/approvals','/inventory','/inventory.csv','/dashboard/verification/B012345678']) {
      const res=await handleFetch(new Request(`https://ops.example.test${path}?access=old-shared-secret`,{headers:{'Cf-Access-Authenticated-User-Email':owner.email,authorization:'Bearer undefined'}}),environment());
      expect(res.status).toBe(403);
    }
    expect(writes).toHaveLength(0);
  });
  it('validates signature, expiration, issuer and audience',async()=>{
    const env=environment();
    expect(await authenticateOperator(request('/ops',await token()),env)).toMatchObject({email:owner.email,role:'owner'});
    for(const claims of [{iss:'https://other.cloudflareaccess.com'},{aud:'another-app'},{exp:1}]){
      const jwt=await new SignJWT({email:owner.email,iss:issuer,aud:'ops-audience',sub:'x',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+100,...claims}).setProtectedHeader({alg:'RS256'}).sign(privateKey);
      expect(await authenticateOperator(request('/ops',jwt),env)).toBeNull();
    }
    const valid=await token(); const parts=valid.split('.'); parts[2]=(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);
    expect(await authenticateOperator(request('/ops',parts.join('.')),env)).toBeNull();
  });
  it('requires membership and rechecks it after revocation even for an existing token',async()=>{
    const jwt=await token('admin@example.test'),env=environment();
    expect(await authenticateOperator(request('/ops',jwt),env)).toBeNull();
    member={role:'admin'};
    expect(await authenticateOperator(request('/ops',jwt),env)).toMatchObject({role:'admin'});
    member=null;
    expect(await authenticateOperator(request('/ops',jwt),env)).toBeNull();
  });
  it('blocks viewer mutations and cross-origin requests before review is reached',async()=>{
    const body=new URLSearchParams({action:'approve',reason:'Verified',attempt_id:'1',evidence_revision:'revision'});
    member={role:'viewer'};
    const viewerRes=await handleFetch(request('/dashboard/verification/B012345678',await token(viewer.email),{method:'POST',headers:{origin:'https://ops.example.test'},body}),environment());
    expect(viewerRes.status).toBe(403);
    const cross=await handleFetch(request('/dashboard/verification/B012345678',await token(),{method:'POST',headers:{origin:'https://other.example.test'},body}),environment());
    expect(cross.status).toBe(403);expect(review).not.toHaveBeenCalled();
  });
  it('attributes review to the verified identity and never puts the old secret in redirects',async()=>{
    const res=await handleFetch(request('/dashboard/verification/B012345678',await token(),{method:'POST',headers:{origin:'https://ops.example.test','Cf-Access-Authenticated-User-Email':'attacker@example.test'},body:new URLSearchParams({action:'approve',reason:'Verified direct listing',attempt_id:'1',evidence_revision:'revision',expected_state:'VERIFIED'})}),environment());
    expect(res.status).toBe(303);expect(res.headers.get('location')).not.toContain('access');
    expect(review.mock.calls[0]?.at(-1)).toBe(owner.email);
  });
  it('rejects a decision made from an outdated lifecycle state',async()=>{
    const res=await handleFetch(request('/dashboard/verification/B012345678',await token(),{method:'POST',headers:{origin:'https://ops.example.test'},body:new URLSearchParams({action:'reject',reason:'Old page',expected_state:'APPROVED'})}),environment());
    expect(res.status).toBe(409);expect(review).not.toHaveBeenCalled();
  });
  it('restricts member management to owner and records access changes atomically',async()=>{
    const env=environment();
    expect((await operationsRoute(new Request('https://ops.example.test/ops/people'),env,viewer))?.status).toBe(403);
    const result=await operationsRoute(new Request('https://ops.example.test/ops/people',{method:'POST',body:new URLSearchParams({email:'new@example.test',role:'admin',status:'ACTIVE',reason:'Invited approval reviewer'})}),env,owner);
    expect(result?.status).toBe(303);expect(writes).toHaveLength(2);expect(writes[1]).toContain(owner.email);
  });
  it('never permits owner changes through the member form',async()=>{
    const result=await operationsRoute(new Request('https://ops.example.test/ops/people',{method:'POST',body:new URLSearchParams({email:owner.email,role:'viewer',status:'REVOKED',reason:'attempt'})}),environment(),owner);
    expect(result?.status).toBe(400);expect(writes).toHaveLength(0);
  });
  it('removes write forms for viewers and shared-token query strings for all operators',()=>{
    const data={verification_queue:[],listing_queue:[{candidate_id:'a'.repeat(64),product_name:'Sample listing',source_url:'https://example.test/item'}],seed_campaigns:[],published_catalog:[],pricing_catalog:[],spawn:{}} as never;
    const source=renderApprovals(data,'');
    const adminPage=wrapExistingPage(source,owner,environment(),'/approvals');
    expect(adminPage).not.toContain('?access=');expect(adminPage).toContain('name="action" value="publish"');
    const view=wrapExistingPage(source,viewer,environment(),'/approvals');expect(view).not.toContain('<form');expect(view).toContain('Read-only access');
    expect(mutationAllowed(new Request('https://ops.example.test/ops',{method:'POST'}),owner)).toBe(false);
  });
});
