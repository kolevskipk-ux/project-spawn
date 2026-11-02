import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {queueScoutRestart,scoutControlAgent,scoutControlPanel,scoutRestartOperations} from '../src/scout-control';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE worker_state(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 const env:any={SCOUT_CONTROL_ENABLED:'true',AMAZON_SERVER_COLLECTOR_TOKEN:'server-test',AMAZON_COLLECTOR_TOKEN:'desktop-test',SPAWN_DB:{prepare(sql:string){let args:any[]=[];return {bind(...a:any[]){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
 const put=(key:string,value:any)=>db.prepare('INSERT OR REPLACE INTO worker_state VALUES(?,?,?)').run(key,JSON.stringify(value),new Date().toISOString());
 const agent=(body?:any,token='server-test')=>scoutControlAgent(new Request('https://spawn.test/internal/scout-control',{method:body?'POST':'GET',headers:{authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined}),env);
 return {env,db,put,agent};
}
const owner:any={role:'owner',email:'owner@test',subject:'owner'};
function form(origin='https://spawn.test'){return new Request('https://spawn.test/ops/scout/restart',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:'action=restart-amazon'});}
describe('Scout restart control',()=>{
 it('requires scoped server authentication and explicit activation',async()=>{const f=fixture();try{
  expect((await f.agent(undefined,'desktop-test'))?.status).toBe(401);
  expect((await f.agent(undefined,'wrong'))?.status).toBe(401);
  f.env.AMAZON_SERVER_COLLECTOR_TOKEN=f.env.AMAZON_COLLECTOR_TOKEN;expect((await f.agent(undefined,'desktop-test'))?.status).toBe(401);
  f.env.SCOUT_CONTROL_ENABLED='false';expect((await f.agent())?.status).toBe(503);
 }finally{f.db.close();}});
 it('atomically limits requests and claims each command once',async()=>{const f=fixture();try{
  const [a,b]=await Promise.all([queueScoutRestart(f.env,owner.email),queueScoutRestart(f.env,owner.email)]);const cmd=a||b;expect(Boolean(a)!==Boolean(b)).toBe(true);
  expect(await (await f.agent())!.json()).toEqual({command:{id:cmd!.id,expiresAt:cmd!.expiresAt}});
  expect((await f.agent({action:'claim',id:cmd!.id}))?.status).toBe(200);
  expect((await f.agent({action:'claim',id:cmd!.id}))?.status).toBe(409);
  expect(await (await f.agent())!.json()).toEqual({command:null});
  expect((await f.agent({action:'result',id:cmd!.id,status:'restarted',reason:'restart_started'}))?.status).toBe(200);
  expect((await f.agent({action:'result',id:cmd!.id,status:'restarted',reason:'restart_started'}))?.status).toBe(200);
 }finally{f.db.close();}});
 it('rejects expired and arbitrary commands',async()=>{const f=fixture();try{
  const c=await queueScoutRestart(f.env,owner.email,new Date(Date.now()-700000));
  expect(await (await f.agent())!.json()).toEqual({command:null});
  expect((await f.agent({action:'claim',id:c!.id}))?.status).toBe(409);
  expect((await f.agent({action:'shell',id:c!.id,command:'anything'}))?.status).toBe(400);
 }finally{f.db.close();}});
 it('requires owner role, same-origin form and a fresh unprotected agent',async()=>{const f=fixture();try{
  expect((await scoutRestartOperations(form(),f.env,{...owner,role:'admin'})).status).toBe(403);
  expect((await scoutRestartOperations(form('https://evil.test'),f.env,owner)).status).toBe(403);
  expect((await scoutRestartOperations(form(),f.env,owner)).status).toBe(409);
  f.put('scout:control:agent',{receivedAt:new Date().toISOString(),protected:true,restartAvailable:true});expect((await scoutRestartOperations(form(),f.env,owner)).status).toBe(409);
  f.put('scout:control:agent',{receivedAt:new Date().toISOString(),protected:false,restartAvailable:true});expect((await scoutRestartOperations(form(),f.env,owner)).status).toBe(303);
  expect((await scoutRestartOperations(form(),f.env,owner)).status).toBe(429);
 }finally{f.db.close();}});
 it('reports coverage separately from restart outcome and hides viewer controls',async()=>{const f=fixture();try{
  expect((await f.agent({action:'report',fresh:8,total:16,protected:false,restartAvailable:true,state:'recovering'}))?.status).toBe(200);
  expect((await f.agent({action:'report',fresh:17,total:16,protected:false,restartAvailable:true,state:'healthy'}))?.status).toBe(400);
  expect(await scoutControlPanel(f.env,owner)).toContain('8 / 16');
  expect(await scoutControlPanel(f.env,{...owner,role:'viewer'})).not.toContain('<form');
 }finally{f.db.close();}});
});


it('keeps recovery-budget and stale-agent protections on the owner form',async()=>{
 const f=fixture();try{
  f.put('scout:control:agent',{receivedAt:new Date(Date.now()-360000).toISOString(),protected:false,restartAvailable:true});
  expect((await scoutRestartOperations(form(),f.env,owner)).status).toBe(409);
  f.put('scout:control:agent',{receivedAt:new Date().toISOString(),protected:false,restartAvailable:false});
  expect((await scoutRestartOperations(form(),f.env,owner)).status).toBe(429);
  expect(await scoutControlPanel(f.env,owner)).toContain(' disabled');
 }finally{f.db.close();}
});
