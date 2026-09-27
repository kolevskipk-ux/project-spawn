import type {Env} from './types';
import {runInventoryRevalidation} from './revalidation';
export const TRIAL_READ_LIMIT=250_000;
export function trialWindow(start:string|undefined,now:Date){
  const begin=Date.parse(start??'');
  return Number.isFinite(begin)&&now.getTime()>=begin&&now.getTime()<begin+6*3600000;
}
export function meteredDatabase(db:D1Database,initialReads=0,readLimit=TRIAL_READ_LIMIT,writeLimit=10_000){
  let reads=initialReads,writes=0;
  const originals=new WeakMap<object,D1PreparedStatement>();
  function account(result:D1Result){
    if(!Number.isFinite(result.meta?.rows_read)||!Number.isFinite(result.meta?.rows_written))throw new Error('trial_missing_metering');
    reads+=result.meta.rows_read;writes+=result.meta.rows_written;
    if(reads>readLimit)throw new Error('trial_read_limit');
    if(writes>writeLimit)throw new Error('trial_write_limit');
    return result;
  }
  function wrap(statement:D1PreparedStatement):D1PreparedStatement{
    const proxy=new Proxy(statement,{get(target,key){
      if(key==='bind')return (...args:unknown[])=>wrap(target.bind(...args));
      if(key==='all'||key==='run')return async()=>account(await target[key]());
      if(key==='first')return async(column?:string)=>{
        const result=account(await target.all<Record<string,unknown>>());
        const row=result.results[0] as Record<string,unknown>|undefined;return row?(column===undefined?row:row[column]):null;
      };
      return ()=>{throw new Error('trial_unmetered_statement_method');};
    }});originals.set(proxy,statement);return proxy;
  }
  const proxy=new Proxy(db,{get(target,key){
    if(key==='prepare')return (sql:string)=>wrap(target.prepare(sql));
    if(key==='batch')return async(statements:D1PreparedStatement[])=>{
      const results=await target.batch(statements.map(s=>originals.get(s)??s));
      for(const r of results){reads+=r.meta.rows_read;writes+=r.meta.rows_written;}
      if(!Number.isFinite(reads)||!Number.isFinite(writes))throw new Error('trial_missing_metering');
      if(reads>readLimit)throw new Error('trial_read_limit');
      if(writes>writeLimit)throw new Error('trial_write_limit');
      return results;
    };
    return ()=>{throw new Error('trial_unmetered_database_method');};
  }});
  return {db:proxy,usage:()=>({reads,writes})};
}
export async function runRevalidationTrial(env:Env,now=new Date()){
  if(!trialWindow(env.INVENTORY_REVALIDATION_TRIAL_START,now))return;
  const key='revalidation_trial:'+env.INVENTORY_REVALIDATION_TRIAL_START;
  const hour=now.toISOString().slice(0,13),stamp=now.toISOString();
  const prior=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind(key).first<string>('value');
  const state=prior?JSON.parse(prior):{status:'ready',hour:'',runs:0,reads:0,writes:0};
  if(state.status!=='ready'||state.hour>=hour||state.runs>=6||state.reads>=TRIAL_READ_LIMIT)return;
  const running={...state,status:'running',hour,runs:state.runs+1};
  // Atomic claim; a crash leaves the experiment stopped instead of retrying.
  const claim=await env.SPAWN_DB.prepare(`INSERT INTO worker_state(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE worker_state.value=?`)
    .bind(key,JSON.stringify(running),stamp,prior??'').run();
  if(claim.meta.changes!==1)return;
  const meter=meteredDatabase(env.SPAWN_DB,state.reads);
  let status='ready',result:unknown;
  try{result=await runInventoryRevalidation({...env,SPAWN_DB:meter.db,INVENTORY_REVALIDATION_ENABLED:'true',INVENTORY_REVALIDATION_BATCH_SIZE:'1'},now);}
  catch(error){status='stopped';result={error:error instanceof Error?error.message:'trial_error'};}
  const usage=meter.usage();
  if(usage.reads>=TRIAL_READ_LIMIT||running.runs>=6)status='stopped';
  await env.SPAWN_DB.prepare('UPDATE worker_state SET value=?,updated_at=? WHERE key=?')
    .bind(JSON.stringify({...running,status,reads:usage.reads,writes:state.writes+usage.writes,result}),new Date().toISOString(),key).run();
}
