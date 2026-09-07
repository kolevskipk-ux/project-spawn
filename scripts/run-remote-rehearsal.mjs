import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(readFileSync(resolve(root,'wrangler.rehearsal.jsonc'),'utf8'));
if(config.name!=='garfield-baseline-rehearsal-20260907'||config.d1_databases[0].database_id!=='9bbb7b48-03e2-4a4e-a6d6-9e24a9f579dd')throw new Error('Unexpected rehearsal resources');
const preflight=spawnSync(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','SPAWN_DB','--remote','--config','wrangler.rehearsal.jsonc','--command',"SELECT name FROM d1_migrations WHERE name='0026_operations_review_locks.sql'",'--json'],{cwd:root,encoding:'utf8',windowsHide:true});
if(preflight.status!==0)throw new Error('Disposable rehearsal database is absent. This historical run was cleaned up; provision and review new isolated resources before rerunning.');
const token=randomBytes(48).toString('hex');
const secret=spawnSync(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'secret','put','REHEARSAL_TOKEN','--config','wrangler.rehearsal.jsonc'],{cwd:root,input:token,encoding:'utf8',windowsHide:true});
if(secret.status!==0)throw new Error('Could not install the ephemeral rehearsal credential');
// Credential exists only in memory and the temporary Worker secret, never in the report.
let response;
for(let attempt=0;attempt<7;attempt++){
  response=await fetch(`https://${config.name}.phil-kolevski.workers.dev`,{method:'POST',headers:{authorization:`Bearer ${token}`}});
  if(response.status!==404)break;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
if(response.status===404)throw new Error('Rehearsal credential deployment has not propagated; no test executed');
const result=await response.json();
writeFileSync(resolve(root,'docs/remote-rehearsal-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(!response.ok||!result.ok)process.exitCode=1;
