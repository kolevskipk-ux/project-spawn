import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const spawnRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catchRoot=resolve(spawnRoot,'../catch-em-all');
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFileSync(path,'utf8');
const contract=read(resolve(spawnRoot,'src/contracts/amazon-catalog.mjs'));
if(contract!==read(resolve(catchRoot,'src/contracts/amazon-catalog.mjs')))throw new Error('Spawn/Catch catalog contract drift. Review and sync the canonical Spawn contract before testing.');
const config=(root,name='wrangler.jsonc')=>{
  const result=ts.parseConfigFileTextToJson(name,read(resolve(root,name)));
  if(result.error)throw new Error(`Cannot parse ${name}`);
  const value=result.config;
  // Only operational switches are reported. Never export credentials or arbitrary vars.
  const flags=Object.fromEntries(Object.entries(value.vars??{}).filter(([key])=>/(_ENABLED|_BATCH_SIZE|_ROLLOUT_MODE|_TARGET_HOURS|_FRESHNESS_HOURS)$/.test(key)));
  return {name:value.name,entrypoint:value.main,crons:value.triggers?.crons??[],flags,keep_vars:Boolean(value.keep_vars),
    binding_names:[...(value.d1_databases??[]),...(value.kv_namespaces??[])].map(binding=>binding.binding),
    config_sha256:hash(read(resolve(root,name)))};
};
const revision=root=>{
  const result=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error('Cannot identify local Git revision');
  const status=spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8',windowsHide:true});
  return {commit:result.stdout.trim(),working_tree_dirty:Boolean(status.stdout.trim())};
};
const run=(cwd,args)=>{
  const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit',windowsHide:true});
  if(result.status!==0)throw new Error(`Local check failed: ${args.join(' ')} (${result.error?.code??result.status})`);
};
const report={generated_at:new Date().toISOString(),scope:'Local source and isolated tests; deployed production state is NOT verified',
  contract:{schema_version:2,sha256:hash(contract)},
  spawn:{...revision(spawnRoot),...config(spawnRoot)},catch:{...revision(catchRoot),...config(catchRoot)},
  migrations:readdirSync(resolve(spawnRoot,'migrations')).filter(name=>name.endsWith('.sql')).sort().map(name=>({name,sha256:hash(read(resolve(spawnRoot,'migrations',name)))})),
  tests:'not run',production_approval_required:['Worker deployment','Any database migration','Any schedule or delivery activation'],
  production_checks_pending:['Exact deployed revisions and effective vars (Catch uses keep_vars)','Applied migration list','Required binding presence without secret values','Freshness and capacity telemetry','Duplicate-delivery behavior under concurrent invocations']};
if(!process.argv.includes('--report-only')){
  run(spawnRoot,['node_modules/typescript/bin/tsc','--noEmit']);
  run(spawnRoot,['node_modules/vitest/vitest.mjs','run','--maxWorkers=2']);
  for(const test of ['worker-smoke.mjs','spawn-sender.mjs','mercadolibre.mjs','customer-communications.mjs','catalog-contract.mjs'])run(catchRoot,[`tests/${test}`]);
  report.tests='passed: Spawn typecheck and complete suite, Catch suites, shared contract parity, isolated cross-Worker rehearsal';
}
const outputIndex=process.argv.indexOf('--output');
if(outputIndex>=0){
  const destination=process.argv[outputIndex+1];
  if(!destination||destination.startsWith('--'))throw new Error('--output requires a report path');
  writeFileSync(resolve(destination),JSON.stringify(report,null,2)+'\n');
  console.log(`Readiness report written to ${resolve(destination)}`);
}else console.log(JSON.stringify(report,null,2));
