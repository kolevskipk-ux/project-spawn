import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {saveSupport,deliverSupport,supportWebhook,type SupportEnv} from '../src/customer-support';
let db:DatabaseSync,env:SupportEnv;
beforeEach(()=>{
 db=new DatabaseSync(':memory:');
 for(const name of ['0001_customer_pilot.sql','0002_customer_access_audit.sql','0003_customer_support.sql'])db.exec(readFileSync('customer-migrations/'+name,'utf8'));
 db.exec("INSERT INTO customer_members(id,email,status,created_at) VALUES('member','test@example.test','ACTIVE','2026-01-01')");
 env={CUSTOMER_DB:{prepare(sql:string){let params:unknown[]=[];return {bind(...p:unknown[]){params=p;return this;},first:async()=>db.prepare(sql).get(...params as never[])??null,run:async()=>db.prepare(sql).run(...params as never[])}}} as unknown as D1Database};
});
afterEach(()=>{vi.unstubAllGlobals();db.close();});
it('preserves requests without a webhook and limits submissions atomically',async()=>{
 for(let i=0;i<5;i++)expect(await saveSupport(env,'member','access','Help')).toBeTruthy();
 expect(await saveSupport(env,'member','access','Sixth')).toBeNull();
 expect(db.prepare("SELECT count(*) n FROM customer_support WHERE delivery_status='FAILED'").get()?.n).toBe(5);
});
it('retries failed delivery, prevents concurrent and already-sent duplicates, and suppresses mentions',async()=>{
 const id=(await saveSupport(env,'member','general','@everyone help'))!;
 env.CUSTOMER_SUPPORT_WEBHOOK_URL='https://discord.com/api/webhooks/123/fake-token';
 const send=vi.fn(async(_url:string,options:RequestInit)=>{
   const payload=JSON.parse(String(options.body));expect(payload.allowed_mentions).toEqual({parse:[]});expect(JSON.stringify(payload)).not.toContain('test@example.test');
   await deliverSupport(env,id,'other-admin');
   return new Response(null,{status:204});
 });vi.stubGlobal('fetch',send);
 await deliverSupport(env,id,'admin');await deliverSupport(env,id,'admin');
 expect(send).toHaveBeenCalledTimes(1);
 expect(db.prepare('SELECT delivery_status,attempted_by FROM customer_support').get()).toEqual({delivery_status:'SENT',attempted_by:'admin'});
});
it('stores safe errors and never puts the secret in the request record',async()=>{
 env.CUSTOMER_SUPPORT_WEBHOOK_URL='https://discord.com/api/webhooks/123/secret-token';
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error(env.CUSTOMER_SUPPORT_WEBHOOK_URL);}));
 const id=await saveSupport(env,'member','account_removal','Remove my account');
 expect(id).toBeTruthy();const row=db.prepare('SELECT * FROM customer_support').get();expect(row?.delivery_status).toBe('FAILED');expect(JSON.stringify(row)).not.toContain('secret-token');
 for(const url of ['http://discord.com/api/webhooks/123/token','https://attacker.test/api/webhooks/123/token','https://discord.com/api/webhooks/123/token?x=y','https://discord.com@attacker.test/api/webhooks/123/token'])expect(supportWebhook(url)).toBeNull();
});
