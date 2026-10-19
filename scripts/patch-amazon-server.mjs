// Patch the existing public Firefox server package; never read private-config.js.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const source=resolve(process.argv[2]||'../work/Scout-Firefox-Server-0.5.4');
const output=resolve(process.argv[3]||'../work/Scout-Amazon-Repair-0.5.5');
mkdirSync(output,{recursive:true});
function replaceRequired(text,before,after){if(!text.includes(before))throw Error('Unexpected server source; patch refused');return text.replace(before,after);}
let policy=readFileSync(resolve(source,'policy.js'),'utf8').replace(/\r\n/g,'\n');
policy=replaceRequired(policy,"const errors=results.filter(r=>['error','unknown'].includes(r.state)||r.panelStatus==='unverified').length,challenges=results.filter(r=>r.state==='blocked').length;",'const {errors,inconclusive,challenges,stopReason}=readHealth(results);');
policy=replaceRequired(policy,'errors,challenges,durationMs','errors,inconclusive,challenges,durationMs');
policy=replaceRequired(policy,"stopReason:challenges?'CHALLENGE':errors/Math.max(1,results.length)>0.2?'READ_FAILURES':null",'stopReason');
policy="import {readHealth} from './read-health.js';\n"+policy;
writeFileSync(resolve(output,'policy.js'),policy);
writeFileSync(resolve(output,'read-health.js'),readFileSync(new URL('../collector/amazon-extension/read-health.js',import.meta.url)));
let background=readFileSync(resolve(source,'background.js'),'utf8').replace(/\r\n/g,'\n');
background="import {HEALTH_ALARM,startHeartbeat,reportHeartbeat} from './health-heartbeat.js';\n"+background;
background=replaceRequired(background,"browser.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)","browser.alarms.onAlarm.addListener(a=>{if(a.name===HEALTH_ALARM){reportHeartbeat();return;}if(a.name===ALARM)");
background=replaceRequired(background,"const s=await browser.storage.local.get(['serverCommissioned','enabled','cooldownUntil']);",`if((await browser.storage.session.get('amazonStartup')).amazonStartup)return;
  await browser.storage.session.set({amazonStartup:true});
  const s=await browser.storage.local.get(['serverCommissioned','enabled','cooldownUntil','leaseUntil','activeRun']);
  // A new browser session cannot still own the old process's in-flight sweep.
  // Event-page wakes return above and must never clear a live lease.
  if(s.leaseUntil||s.activeRun){
   await browser.storage.local.remove(['leaseUntil','activeRun']);
   await browser.storage.local.set({nextRunAt:Date.now()+30000});
   await diagnostic('INTERRUPTED_SWEEP_RECOVERED');
  }`);
background=replaceRequired(background,"await browser.tabs.create({url:browser.runtime.getURL('dashboard.html')});",`const url=browser.runtime.getURL('dashboard.html');
  const dashboards=await browser.tabs.query({url});
  if(dashboards.length>1)await browser.tabs.remove(dashboards.slice(1).map(t=>t.id));
  if(!dashboards.length)await browser.tabs.create({url,active:false});
  await startHeartbeat();`);
writeFileSync(resolve(output,'background.js'),background);
const manifest=JSON.parse(readFileSync(resolve(source,'manifest.json'),'utf8'));manifest.version='0.5.5';
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(resolve(output,'health-heartbeat.js'),`import {AMAZON_COLLECTOR_TOKEN} from './private-config.js';
export const HEALTH_ALARM='scout-health-heartbeat';
export async function reportHeartbeat(){
 try{const s=await browser.storage.local.get(['enabled','manualPaused','stopReason','challengeAttempts']);
 const r=await fetch('https://spawn.aztlan-eng.com/internal/amazon-browser/heartbeat',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{authorization:'Bearer '+AMAZON_COLLECTOR_TOKEN,'content-type':'application/json'},body:JSON.stringify({enabled:s.enabled===true,manualPaused:s.manualPaused===true,stopReason:['CHALLENGE','READ_FAILURES','RUN_FAILED','RELOADED'].includes(s.stopReason)?s.stopReason:null,challengeAttempts:Math.min(100,Math.max(0,Number(s.challengeAttempts)||0))})});await r.body?.cancel();return {ok:r.ok};}catch{return {ok:false};}
}
export async function startHeartbeat(){await browser.alarms.create(HEALTH_ALARM,{periodInMinutes:1});return reportHeartbeat();}
`);
console.log(JSON.stringify({output,version:manifest.version,credentialsIncluded:false}));
