import {describe,it,expect,vi} from 'vitest';
import {trialWindow,meteredDatabase,runRevalidationTrial,TRIAL_READ_LIMIT} from '../src/revalidation-trial';
import type {Env} from '../src/types';
const start='2026-09-27T00:00:00Z';
describe('finite revalidation trial',()=>{
  it('fails closed outside the six-hour window',async()=>{
    for(const date of ['2026-09-26T23:59:59Z','2026-09-27T06:00:00Z']){
      expect(trialWindow(start,new Date(date))).toBe(false);
      await runRevalidationTrial({INVENTORY_REVALIDATION_TRIAL_START:start} as Env,new Date(date));
    }
    expect(trialWindow(undefined,new Date(start))).toBe(false);
    expect(trialWindow('invalid',new Date(start))).toBe(false);
    expect(trialWindow(start,new Date(start))).toBe(true);
  });
  it('meters first and stops after the statement that crosses the limit',async()=>{
    const stmt={bind(){return this;},all:vi.fn(async()=>({results:[{value:'ok'}],meta:{rows_read:10,rows_written:0}}))};
    const meter=meteredDatabase({prepare:()=>stmt} as unknown as D1Database,TRIAL_READ_LIMIT-5);
    await expect(meter.db.prepare('query').bind('x').first('value')).rejects.toThrow('trial_read_limit');
    expect(meter.usage().reads).toBe(TRIAL_READ_LIMIT+5);
  });
  it('rejects missing metering and unsupported execution paths',async()=>{
    const db={prepare:()=>({all:async()=>({results:[],meta:{}})})} as unknown as D1Database;
    await expect(meteredDatabase(db).db.prepare('query').all()).rejects.toThrow('trial_missing_metering');
    expect(()=>meteredDatabase(db).db.exec('query')).toThrow('trial_unmetered_database_method');
  });
  it('skips duplicate hours, exhausted and interrupted trials before execution',async()=>{
    for(const state of [{status:'running'},{status:'stopped'},{status:'ready',hour:'2026-09-27T00'}, {status:'ready',runs:6},{status:'ready',reads:TRIAL_READ_LIMIT}]){
      const prepare=vi.fn(()=>({bind:()=>({first:async()=>JSON.stringify(state)})}));
      await runRevalidationTrial({SPAWN_DB:{prepare},INVENTORY_REVALIDATION_TRIAL_START:start} as unknown as Env,new Date(start));
      expect(prepare).toHaveBeenCalledTimes(1);
    }
  });
});
