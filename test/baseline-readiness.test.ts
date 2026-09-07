import {describe,expect,it} from 'vitest';
import {baselineReadiness} from '../src/baseline-readiness';

describe('read-only baseline readiness',()=>{
  it('separates monthly identity maintenance from overdue availability and unknown telemetry',()=>{
    const now=Date.parse('2026-09-07T12:00:00Z');
    const targets=[{asin:'B0H27L3TKW',language:'spanish',verified_at:'2026-08-01T12:00:00Z',poll_interval_minutes:5},
      {asin:'B0HG3MQDWP',language:'unknown',verified_at:'2026-09-06T12:00:00Z',poll_interval_minutes:60}];
    const original=JSON.stringify(targets);
    const result=baselineReadiness(targets,[{asin:targets[0].asin,cadenceMinutes:30,lastAttemptAt:'2026-09-07T11:50:00Z'}],now);
    expect(result.counts).toEqual({published:2,catch_confirmed:1,overdue:1,identity_review_due:1,language_unconfirmed:1});
    expect(result.rows[0]).toMatchObject({requested_cadence_minutes:5,effective_cadence_minutes:30,availability_check_overdue:false});
    expect(JSON.stringify(targets)).toBe(original);
  });
});
