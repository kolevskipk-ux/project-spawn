import type {Env} from './types';
import {meteredDatabase} from './revalidation-trial';
import {runInventoryRevalidation} from './revalidation';

export const OBSERVATION_HOURS=72, DAILY_READS=1_000_000, DAILY_WRITES=10_000;
export function observationDay(start:string|undefined,now:Date):number|null{
  const elapsed=now.getTime()-Date.parse(start??'');
  return Number.isFinite(elapsed)&&elapsed>=0&&elapsed<OBSERVATION_HOURS*3600000?Math.floor(elapsed/86400000):null;
}
interface Sample {hour:string;reads:number;writes:number;attempted:number;outcomes:Record<string,number>;error?:string;}
interface State {status:'ready'|'running'|'stopped';hour:string;runs:number;reads:number;writes:number;day:number;dayReads:number;dayWrites:number;history:Sample[];}
export async function runInventoryObservation(env:Env,now=new Date()){
  const day=observationDay(env.INVENTORY_OBSERVATION_START,now);
  if(day===null)return;
  const key='inventory_observation:'+env.INVENTORY_OBSERVATION_START,stamp=now.toISOString(),hour=stamp.slice(0,13);
  const prior=await env.SPAWN_DB.prepare('SELECT value FROM worker_state WHERE key=?').bind(key).first<string>('value');
  const state:State=prior?JSON.parse(prior):{status:'ready',hour:'',runs:0,reads:0,writes:0,day,dayReads:0,dayWrites:0,history:[]};
  if(!['ready','running','stopped'].includes(state.status)||![state.runs,state.reads,state.writes,state.dayReads,state.dayWrites,state.day].every(n=>Number.isFinite(n)&&n>=0)||!Array.isArray(state.history))throw new Error('invalid_observation_state');
  if(state.status!=='ready'||state.hour>=hour||state.runs>=72||state.reads>=3*DAILY_READS||state.writes>=3*DAILY_WRITES)return;
  const dayReads=state.day===day?state.dayReads:0,dayWrites=state.day===day?state.dayWrites:0;
  if(dayReads>=DAILY_READS||dayWrites>=DAILY_WRITES)return;
  const running:State={...state,status:'running',hour,day,dayReads,dayWrites,runs:state.runs+1};
  const claim=await env.SPAWN_DB.prepare(`INSERT INTO worker_state(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE worker_state.value=?`)
    .bind(key,JSON.stringify(running),stamp,prior??'').run();
  if(claim.meta.changes!==1)return;
  // A crash leaves 'running', preventing further work without operator review.
  const meter=meteredDatabase(env.SPAWN_DB,0,Math.min(DAILY_READS-dayReads,3*DAILY_READS-state.reads),Math.min(DAILY_WRITES-dayWrites,3*DAILY_WRITES-state.writes));
  let error:string|undefined,attempted=0;
  const outcomes:Record<string,number>={};
  try{
    const result=await runInventoryRevalidation({...env,SPAWN_DB:meter.db,INVENTORY_REVALIDATION_ENABLED:'true',INVENTORY_REVALIDATION_BATCH_SIZE:'5'},now);
    attempted=result.attempted;
    for(const item of result.results){const outcome=String(item.outcome??'UNKNOWN');outcomes[outcome]=(outcomes[outcome]??0)+1;}
  }catch(caught){error=caught instanceof Error?caught.message:'observation_error';}
  const {reads,writes}=meter.usage();
  const stopped=!!error||running.runs>=72||dayReads+reads>=DAILY_READS||dayWrites+writes>=DAILY_WRITES||state.reads+reads>=3*DAILY_READS||state.writes+writes>=3*DAILY_WRITES;
  const final={...running,status:stopped?'stopped':'ready',reads:state.reads+reads,writes:state.writes+writes,dayReads:dayReads+reads,dayWrites:dayWrites+writes,
    history:[...state.history,{hour,reads,writes,attempted,outcomes,...(error?{error}:{})}],...(error?{error}:{})};
  await env.SPAWN_DB.prepare('UPDATE worker_state SET value=?,updated_at=? WHERE key=? AND value=?')
    .bind(JSON.stringify(final),new Date().toISOString(),key,JSON.stringify(running)).run();
}
