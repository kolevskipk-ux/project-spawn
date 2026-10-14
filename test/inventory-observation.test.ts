import {describe,it,expect,vi,beforeEach} from 'vitest';
import {runInventoryObservation,observationDay} from '../src/inventory-observation';
import {runInventoryRevalidation} from '../src/revalidation';
import type {Env} from '../src/types';
vi.mock('../src/revalidation',()=>({runInventoryRevalidation:vi.fn()}));
const start='2026-09-27T19:30:00Z';
function fixture(){
  let value:string|null=null;
  const db={prepare(sql:string){return {bind(...args:unknown[]){return {
    first:async()=>value,
    run:async()=>{
      if(sql.startsWith('INSERT')){if(value!==null&&value!==args[3])return {meta:{changes:0}};value=String(args[1]);}
      else if(value===args[3])value=String(args[0]);
      return {meta:{changes:1}};
    }
  };}};}};
  return {env:{SPAWN_DB:db,INVENTORY_OBSERVATION_START:start} as unknown as Env,get:()=>value?JSON.parse(value):null,set:(v:unknown)=>{value=JSON.stringify(v);}};
}
beforeEach(()=>{vi.mocked(runInventoryRevalidation).mockReset();});
describe('72-hour inventory observation',()=>{
  it('expires independently of monitoring and uses start-relative days',async()=>{
    expect(observationDay(start,new Date('2026-09-28T19:29:59Z'))).toBe(0);
    expect(observationDay(start,new Date('2026-09-28T19:30:00Z'))).toBe(1);
    expect(observationDay(start,new Date('2026-09-30T19:30:00Z'))).toBe(null);
    expect(observationDay(undefined,new Date(start))).toBe(null);
    await runInventoryObservation({INVENTORY_OBSERVATION_START:start} as Env,new Date('2026-09-30T19:30:00Z'));
    expect(runInventoryRevalidation).not.toHaveBeenCalled();
  });
  it('records outcomes, limits the batch and skips duplicate or concurrent calls',async()=>{
    const f=fixture();
    vi.mocked(runInventoryRevalidation).mockResolvedValue({enabled:true,attempted:2,results:[{outcome:'AVAILABLE'},{outcome:'UNKNOWN'}]});
    await Promise.all([runInventoryObservation(f.env,new Date('2026-09-27T20:05:00Z')),runInventoryObservation(f.env,new Date('2026-09-27T20:05:00Z'))]);
    await runInventoryObservation(f.env,new Date('2026-09-27T20:35:00Z'));
    expect(runInventoryRevalidation).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runInventoryRevalidation).mock.calls[0][0].INVENTORY_REVALIDATION_BATCH_SIZE).toBe('5');
    expect(f.get().history[0]).toMatchObject({attempted:2,outcomes:{AVAILABLE:1,UNKNOWN:1}});
  });
  it('persists an error stop and never retries it on the next day',async()=>{
    const f=fixture();
    vi.mocked(runInventoryRevalidation).mockRejectedValue(new Error('trial_read_limit'));
    await runInventoryObservation(f.env,new Date('2026-09-27T20:05:00Z'));
    expect(f.get()).toMatchObject({status:'stopped',error:'trial_read_limit'});
    await runInventoryObservation(f.env,new Date('2026-09-28T20:05:00Z'));
    expect(runInventoryRevalidation).toHaveBeenCalledTimes(1);
  });
  it('keeps an interrupted claim stopped and respects exhausted daily budget',async()=>{
    const f=fixture();
    const state={status:'running',hour:'',runs:1,reads:0,writes:0,day:0,dayReads:0,dayWrites:0,history:[]};
    f.set(state);await runInventoryObservation(f.env,new Date('2026-09-27T20:05:00Z'));
    f.set({...state,status:'ready',dayReads:1000000});await runInventoryObservation(f.env,new Date('2026-09-27T20:05:00Z'));
    expect(runInventoryRevalidation).not.toHaveBeenCalled();
  });
});
