// Read-only Cloudflare analytics. Never prints or copies the Wrangler OAuth token.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const file=join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml');
const token=readFileSync(file,'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw new Error('Wrangler OAuth unavailable; run wrangler d1 list to refresh authentication.');
const end=new Date();end.setUTCMinutes(0,0,0);
const start=new Date(+end-48*3600000);
const query=`query CostWatch($accountTag:string,$filter:ZoneWorkersRequestsFilter_InputObject){viewer{accounts(filter:{accountTag:$accountTag}){d1AnalyticsAdaptiveGroups(limit:100,filter:$filter){sum{rowsRead rowsWritten readQueries writeQueries} dimensions{datetimeHour}}}}}`;
const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query,variables:{accountTag:'cdffe2a29c017a054a8105e0b1c9383b',filter:{AND:[{datetimeHour_geq:start.toISOString(),datetimeHour_lt:end.toISOString(),databaseId:'8fd44e8d-9ffc-4f9b-8c2c-f6ba1a9827aa'}]}}}),signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error(`Analytics HTTP ${response.status}; no cost conclusion available.`);
const data=await response.json();if(data.errors?.length)throw new Error('Cloudflare analytics returned errors; no cost conclusion available.');
const groups=data.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
if(!Array.isArray(groups))throw new Error('Analytics missing; no cost conclusion available.');
const hourly=new Map();
for(const row of groups){const hour=row.dimensions?.datetimeHour;if(!hour||!row.sum)continue;const total=hourly.get(hour)||{hour,rowsRead:0,rowsWritten:0,readQueries:0,writeQueries:0};for(const key of ['rowsRead','rowsWritten','readQueries','writeQueries']){if(!Number.isFinite(row.sum[key]))throw new Error('Incomplete analytics');total[key]+=row.sum[key];}hourly.set(hour,total);}
const health=await Promise.all(['healthz','readyz'].map(async path=>{try{const r=await fetch(`https://spawn.aztlan-eng.com/${path}`,{signal:AbortSignal.timeout(15000)});return {path,status:r.status,ok:r.ok&&(await r.json()).ok===true};}catch{return {path,ok:false};}}));
console.log(JSON.stringify({checkedAt:new Date().toISOString(),requestedStart:start.toISOString(),requestedEndExclusive:end.toISOString(),deploymentAt:'2026-09-19T23:23:00Z',note:'Hourly analytics may lag. Empty or absent hours are unknown, not zero. Exclude the mixed deployment hour. Read cost estimate assumes the included allowance is already exhausted; it is not a full account bill.',health,hours:[...hourly.values()].sort((a,b)=>a.hour.localeCompare(b.hour)).map(row=>({...row,estimatedReadUsd:row.rowsRead/1e9,projectedDailyReadUsd:row.rowsRead/1e9*24}))},null,2));
