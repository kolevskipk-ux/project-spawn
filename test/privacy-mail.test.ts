import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {privacyMail,deliverPrivacyMailAlerts} from '../src/privacy-mail';
let db:DatabaseSync,env:Parameters<typeof privacyMail>[1];
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(readFileSync('migrations/0037_privacy_mail_alerts.sql','utf8'));
 const storage={prepare(sql:string){let params:unknown[]=[];return {bind(...p:unknown[]){params=p;return this;},first:async()=>db.prepare(sql).get(...params as never[])??null,all:async()=>({results:db.prepare(sql).all(...params as never[])}),run:async()=>db.prepare(sql).run(...params as never[])}}} as unknown as D1Database;
 env={SPAWN_DB:storage,PRIVACY_MAIL_ENABLED:'true',PRIVACY_MAIL_FORWARD_TO:'owner@example.test',OPS_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/fake'};
});
afterEach(()=>{vi.unstubAllGlobals();db.close();});
it('forwards mail even during a Discord outage, then retries without disclosing mail content',async()=>{
 const send=vi.fn(async(_url:string|URL|Request,_options?:RequestInit)=>new Response(null,{status:503}));vi.stubGlobal('fetch',send);
 const forward=vi.fn(async()=>{}),pending:Promise<unknown>[]=[];
 await privacyMail({to:'sales@aztlan-eng.com',forward,setReject:vi.fn()},env,{waitUntil:p=>pending.push(p)} as Pick<ExecutionContext,'waitUntil'>);
 await Promise.all(pending);expect(forward).toHaveBeenCalledWith('owner@example.test');
 expect(db.prepare('SELECT delivered_at,attempts FROM privacy_mail_alerts').get()).toMatchObject({delivered_at:null,attempts:1});
 send.mockImplementation(async()=>new Response(null,{status:204}));
 await deliverPrivacyMailAlerts(env,send as typeof fetch,new Date(Date.now()+121000));
 expect(db.prepare('SELECT delivered_at FROM privacy_mail_alerts').get()?.delivered_at).toBeTruthy();
 const payload=JSON.parse(String(send.mock.calls[0][1]?.body));expect(payload.allowed_mentions).toEqual({parse:[]});
 expect(payload.content).not.toContain('owner@example.test');
 expect(Object.keys(db.prepare('SELECT * FROM privacy_mail_alerts').get()!)).toEqual(['id','received_at','delivered_at','lease_until','attempts']);
 await deliverPrivacyMailAlerts(env,send as typeof fetch,new Date(Date.now()+122000));expect(send).toHaveBeenCalledTimes(2);
});
it('preserves a forwarding error while still alerting Ops and rejects unintended recipients',async()=>{
 const forward=vi.fn(async()=>{throw Error('forward unavailable');}),pending:Promise<unknown>[]=[];
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:204})));
 await expect(privacyMail({to:'sales@aztlan-eng.com',forward,setReject:vi.fn()},env,{waitUntil:p=>pending.push(p)} as Pick<ExecutionContext,'waitUntil'>)).rejects.toThrow('forward unavailable');
 await Promise.all(pending);expect(db.prepare('SELECT delivered_at FROM privacy_mail_alerts').get()?.delivered_at).toBeTruthy();
 const reject=vi.fn();await privacyMail({to:'other@aztlan-eng.com',forward,setReject:reject},env,{} as Pick<ExecutionContext,'waitUntil'>);
 expect(reject).toHaveBeenCalled();expect(forward).toHaveBeenCalledTimes(1);
});
it('leases alerts so overlapping retries send once and deletes only old completed alerts',async()=>{
 const old=new Date(Date.now()-9*86400000).toISOString();
 db.prepare('INSERT INTO privacy_mail_alerts(id,received_at) VALUES(?,?)').run('pending',old);
 db.prepare('INSERT INTO privacy_mail_alerts(id,received_at,delivered_at) VALUES(?,?,?)').run('completed',old,old);
 const send=vi.fn(async()=>{await deliverPrivacyMailAlerts(env,send as typeof fetch);return new Response(null,{status:204});});
 await deliverPrivacyMailAlerts(env,send as typeof fetch);expect(send).toHaveBeenCalledTimes(1);
 expect(db.prepare('SELECT id FROM privacy_mail_alerts').all()).toEqual([{id:'pending'}]);
});
