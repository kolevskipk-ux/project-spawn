import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleCostWatch} from '../src/cost-watch';
it('authenticates, routes only to Ops, deduplicates, rejects changed receipts and retries failed sends',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('migrations/0045_cost_watch_alerts.sql','utf8'));
 const env={COST_WATCH_TOKEN:'test-token',OPS_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz',SPAWN_DB:{prepare(sql:string){let args:any[]=[];return {bind(...v:any[]){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async run(){return db.prepare(sql).run(...args);}};}}} as any;
 const request=(body:any,token='test-token')=>new Request('https://spawn.example/internal/cost-watch/alert',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)});
 let calls=0,fail=false;
 const fetchFn=(async(url:any,init:any)=>{calls++;expect(url).toBe(env.OPS_DISCORD_WEBHOOK_URL+'?wait=true');expect(JSON.parse(init.body).allowed_mentions).toEqual({parse:[]});return new Response('',{status:fail?500:200});}) as typeof fetch;
 const alert={id:'incident-1',kind:'ELEVATED',summary:'Observed read rate exceeds investigation threshold.'};
 const time=new Date('2026-09-20T00:00:00Z');
 try{
 expect((await handleCostWatch(request(alert,'wrong'),env,fetchFn,time))?.status).toBe(401);expect(calls).toBe(0);
 expect((await handleCostWatch(request({...alert,kind:'OTHER'}),env,fetchFn,time))?.status).toBe(400);
 expect((await handleCostWatch(request(alert),env,fetchFn,time))?.status).toBe(200);
 expect(await (await handleCostWatch(request(alert),env,fetchFn,time))?.json()).toEqual({status:'already_delivered'});expect(calls).toBe(1);
 expect((await handleCostWatch(request({...alert,summary:'Changed'}),env,fetchFn,time))?.status).toBe(409);
 fail=true;const second={...alert,id:'incident-2'};
 expect((await handleCostWatch(request(second),env,fetchFn,time))?.status).toBe(502);
 expect((await handleCostWatch(request(second),env,fetchFn,time))?.status).toBe(202);expect(calls).toBe(2);
 fail=false;expect((await handleCostWatch(request(second),env,fetchFn,new Date(+time+121000)))?.status).toBe(200);expect(calls).toBe(3);
 expect((await handleCostWatch(request({...alert,id:'oversize',summary:'x'.repeat(1401)}),env,fetchFn,time))?.status).toBe(400);
 }finally{db.close();}
});
