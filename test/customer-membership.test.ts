import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import type {CustomerEnv} from '../src/customer';
import {customerEntitlement,startDiscordLink,finishDiscordLink,membershipRequired} from '../src/customer-membership';
import {discordInteraction,syncInventoryRoles} from '../src/customer-discord';
let db:DatabaseSync,env:CustomerEnv;
const member={id:'customer',email:'member@example.test',status:'ACTIVE'},now=new Date('2026-09-09T20:00:00Z'),guild='1537592665535942709',user='1537592665535942710',app='1537592665535942711',role='1537592665535942712';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(now);db=new DatabaseSync(':memory:');for(const name of readdirSync('customer-migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('customer-migrations/'+name,'utf8'));const storage={prepare(sql:string){let args:unknown[]=[];return {bind(...p:unknown[]){args=p;return this;},async first(){return db.prepare(sql).get(...args as never[])??null;},async all(){return {results:db.prepare(sql).all(...args as never[])};},async run(){return db.prepare(sql).run(...args as never[]);}};}};env={CUSTOMER_DB:storage,DISCORD_APPLICATION_ID:app,DISCORD_GUILD_ID:guild,DISCORD_CLIENT_SECRET:'fixture',DISCORD_BOT_TOKEN:'fixture',DISCORD_REDIRECT_URI:'https://customer.example/app/discord/callback',CUSTOMER_TERMS_VERSION:'v1',DISCORD_FREE_ACCESS_ENABLED:'true'} as unknown as CustomerEnv;db.prepare("INSERT INTO customer_members(id,email,status,created_at) VALUES(?,?,'ACTIVE',?)").run(member.id,member.email,now.toISOString());vi.stubGlobal('fetch',vi.fn(async()=>Response.json({roles:[]})));});
afterEach(()=>{db.close();vi.unstubAllGlobals();vi.useRealTimers();});
it('limits the new-account rollout to the activation cohort without requiring existing member acknowledgment',()=>{
 env.CUSTOMER_MEMBERSHIP_MODE='new_accounts';env.CUSTOMER_TERMS_REQUIRED_FROM='2026-09-10T00:47:12.000Z';
 expect(membershipRequired(env,{...member,created_at:'2026-09-09T00:00:00.000Z'})).toBe(false);
 expect(membershipRequired(env,{...member,created_at:'2026-09-10T00:47:12.000Z'})).toBe(true);
 expect(membershipRequired(env,{...member,created_at:'2026-09-11T00:00:00.000Z'})).toBe(true);
});
function linked(){db.prepare("INSERT INTO customer_discord_links(customer_id,discord_user_id,guild_id,linked_at) VALUES(?,?,?,?)").run(member.id,user,guild,now.toISOString());}
function accepted(){db.prepare('INSERT INTO customer_terms_acceptances VALUES(?,?,?,1)').run(member.id,'v1',now.toISOString());}
it('requires linking and terms, allows all members in free mode, then enforces the qualifying role',async()=>{
 expect((await customerEntitlement(env,member,now)).reason).toBe('link_discord');linked();
 expect((await customerEntitlement(env,member,now)).reason).toBe('accept_terms');accepted();
 expect((await customerEntitlement(env,member,now)).allowed).toBe(true);
 env.DISCORD_FREE_ACCESS_ENABLED='false';env.DISCORD_REQUIRED_ROLE_ID=role;
 expect((await customerEntitlement(env,member,now)).reason).toBe('required_role');
 db.prepare('UPDATE customer_discord_links SET roles_json=?').run(JSON.stringify([role]));
 expect((await customerEntitlement(env,member,now)).allowed).toBe(true);
 env.CUSTOMER_TERMS_VERSION='v2';expect((await customerEntitlement(env,member,now)).reason).toBe('accept_terms');
});
it('limits outage grace and immediately denies explicit departure and admin revocation',async()=>{
 linked();accepted();await customerEntitlement(env,member,now);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})));
 expect((await customerEntitlement(env,member,new Date(now.getTime()+16*60000))).allowed).toBe(true);
 expect((await customerEntitlement(env,member,new Date(now.getTime()+61*60000))).allowed).toBe(false);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:404})));
 expect((await customerEntitlement(env,member,new Date(now.getTime()+80*60000))).reason).toBe('join_server');
 expect((await customerEntitlement(env,{...member,status:'REVOKED'},now)).reason).toBe('revoked');
});
it('binds OAuth state to the customer and prevents replay without retaining tokens',async()=>{
 const authorize=new URL(await startDiscordLink(env,member)),callback=new URL(env.DISCORD_REDIRECT_URI!);callback.search=new URLSearchParams({state:authorize.searchParams.get('state')!,code:'fixture-code'}).toString();
 expect(authorize.searchParams.get('scope')).toBe('identify');
 await expect(finishDiscordLink(env,{...member,id:'other'},callback)).rejects.toThrow('expired');
 const api=vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/token')?Response.json({access_token:'private-token'}):String(input).endsWith('/@me')?Response.json({id:user}):new Response(null,{status:200}));vi.stubGlobal('fetch',api);
 await finishDiscordLink(env,member,callback);await expect(finishDiscordLink(env,member,callback)).rejects.toThrow('already used');
 expect(db.prepare('SELECT discord_user_id FROM customer_discord_links').get()?.discord_user_id).toBe(user);
 expect(api.mock.calls.some(c=>String(c[0]).endsWith('/revoke'))).toBe(true);
});
it('assigns only the configured marker role and removes it for revoked accounts',async()=>{
 linked();accepted();env.DISCORD_ROLE_SYNC_ENABLED='true';env.DISCORD_INVENTORY_ROLE_ID=role;
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push((init?.method??'GET')+' '+url);return url.endsWith('/roles')?Response.json([{id:role,permissions:'0',managed:false}]):url.endsWith('/roles/'+role)?new Response(null,{status:204}):Response.json({roles:[]});}));
 await syncInventoryRoles(env);expect(calls.some(c=>c.startsWith('PUT '))).toBe(true);
 db.exec("UPDATE customer_members SET status='REVOKED',updated_by='admin',updated_at='now',change_reason='test'");
 await syncInventoryRoles(env);expect(calls.some(c=>c.startsWith('DELETE '))).toBe(true);
 env.DISCORD_REQUIRED_ROLE_ID=role;await expect(syncInventoryRoles(env)).rejects.toThrow('Separate');
});
it('verifies Discord signatures and confines private replies to the configured server',async()=>{
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']) as CryptoKeyPair;env.DISCORD_PUBLIC_KEY=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex');env.CUSTOMER_PUBLIC_URL='https://customer.example';
 const request=async(guildId=guild)=>{const raw=JSON.stringify({type:2,application_id:app,guild_id:guildId,data:{name:'inventory'}}),stamp=String(now.getTime()/1000),signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(stamp+raw))).toString('hex');return new Request('https://customer.example/discord/interactions',{method:'POST',headers:{'x-signature-ed25519':signature,'x-signature-timestamp':stamp},body:raw});};
 const result=await discordInteraction(await request(),env);expect((await result.json() as any).data.flags).toBe(64);
 expect((await discordInteraction(await request('1537592665535942799'),env)).status).toBe(403);
 expect((await discordInteraction(new Request('https://customer.example/discord/interactions',{method:'POST',body:'{}'}),env)).status).toBe(401);
});
