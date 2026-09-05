import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {query,scope,selected} from './customer-refresh-db.mjs';
import {assessProductEvidence} from '../src/product-page-evidence.ts';
import {refreshStatements} from '../src/customer-refresh-write.ts';
if(process.argv[2]!=='--apply'||!process.argv[3])throw Error('Explicit --apply and reviewed report path required');
const reportPath=await realpath(process.argv[3]),artifactRoot=await realpath('artifacts');if(!reportPath.startsWith(artifactRoot+sep))throw Error('Report must be in workspace artifacts');
const report=JSON.parse(await readFile(reportPath,'utf8')),folder=resolve(reportPath,'..');if(report.database!=='project-spawn'||report.rows.length>55)throw Error('Unexpected scope');
const cte=await scope(),current=new Map((await selected()).map(r=>[r.id,r]));
const receipt={runId:report.runId,startedAt:new Date().toISOString(),results:[]};
const {stdout:recovery}=await promisify(execFile)(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'d1','time-travel','info','SPAWN_DB','--config','wrangler.jsonc','--json'],{windowsHide:true,maxBuffer:100000});await writeFile(resolve(folder,'recovery-before-apply.json'),recovery);
for(const row of report.rows){if(!row.attempted)continue;
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(row.id))throw Error('Invalid listing key');
 const live=current.get(row.id);if(!live||live.last_seen_at!==row.last_seen_at||live.canonical_url!==row.canonical_url||live.title!==row.title){receipt.results.push({id:row.id,status:'SKIPPED_CHANGED'});continue;}
 const html=await readFile(resolve(folder,row.id+'.html'),'utf8');
 if(row.httpStatus){const assessed=assessProductEvidence(row.httpStatus,html,row.canonical_url,row.title,row.retailer_sku);if(assessed.outcome!==row.outcome||assessed.priceMxn!==row.priceMxn||assessed.evidence!==row.evidence)throw Error('Stored assessment no longer matches evidence');}
 row.htmlHash=createHash('sha256').update(html).digest('hex');
 const result=await query(refreshStatements(row,report.runId,cte).join('\n'));
 receipt.results.push({id:row.id,outcome:row.outcome,changes:result.map(r=>r.meta?.changes??0)});await writeFile(resolve(folder,'apply-receipt.json'),JSON.stringify(receipt,null,2));
 if(receipt.results.length%10===0)console.log(JSON.stringify({saved:receipt.results.length,total:report.rows.length}));
}
receipt.finishedAt=new Date().toISOString();await writeFile(resolve(folder,'apply-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({receipt:resolve(folder,'apply-receipt.json'),processed:receipt.results.length}));
