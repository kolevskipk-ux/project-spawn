import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),exec=promisify(execFile);
const knownFlags=new Set(['OPS_AUTH_MODE','AMAZON_CADENCE_ROLLOUT_MODE','CUSTOMER_ALERT_DELIVERY_MODE','CUSTOMER_EVENT_DELIVERY_ENABLED','DAILY_HUNT_DIGEST_ENABLED','INVENTORY_REVALIDATION_ENABLED','AMAZON_ENRICHMENT_ENABLED','SEED_VERIFICATION_ENABLED','INVENTORY_REVALIDATION_BATCH_SIZE','AMAZON_ENRICHMENT_BATCH_SIZE','SEED_VERIFICATION_BATCH_SIZE','INVENTORY_REVALIDATION_TARGET_HOURS','INVENTORY_FRESHNESS_HOURS']);
async function cli(cwd,args){
  const {stdout}=await exec(process.execPath,[resolve(cwd,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd,windowsHide:true,maxBuffer:4_000_000});
  return JSON.parse(stdout);
}
const report={audited_at:new Date().toISOString(),operation:'Read-only Worker deployment and D1 schema inventory',workers:[]};
for(const [repo,configName,environment] of [['project-spawn','wrangler.jsonc','production'],['catch-em-all','wrangler.jsonc','production'],['project-spawn','wrangler.dev.jsonc','development'],['catch-em-all','wrangler.dev.jsonc','development']]){
  const cwd=resolve(root,'..',repo),config=JSON.parse(readFileSync(resolve(cwd,configName),'utf8'));
  const deployments=await cli(cwd,['deployments','list','--config',configName,'--json']);
  const list=Array.isArray(deployments)?deployments:deployments.deployments;
  if(!Array.isArray(list)||!list.length)throw new Error(`No deployment history for ${config.name}`);
  const latest=[...list].sort((a,b)=>String(b.created_on).localeCompare(String(a.created_on)))[0];
  const versions=[];
  for(const deployed of latest.versions){
    const version=await cli(cwd,['versions','view',deployed.version_id,'--config',configName,'--json']);
    const bindings=version.resources?.bindings??version.bindings??[];
    versions.push({id:deployed.version_id,percentage:deployed.percentage,created_on:version.metadata?.created_on,
      annotations:version.annotations,resource_keys:Object.keys(version.resources??{}),
      bindings:bindings.map(binding=>({name:binding.name,type:binding.type,
        ...(knownFlags.has(binding.name)?{value:binding.text??binding.value}:{}),
        ...(['d1','kv_namespace','service'].includes(binding.type)?{resource:binding.id??binding.namespace_id??binding.service}:{} )}))});
  }
  let migrations;
  if(repo==='project-spawn')migrations=await cli(cwd,['d1','execute','SPAWN_DB','--remote','--config',configName,'--command','SELECT name,applied_at FROM d1_migrations ORDER BY id','--json']);
  const worker={name:config.name,environment,deployment_id:latest.id,created_on:latest.created_on,versions,migrations};
  report.workers.push(worker);
  console.log(JSON.stringify({name:worker.name,environment,deployment_id:worker.deployment_id,versions:versions.map(v=>({id:v.id,bindings:v.bindings,resource_keys:v.resource_keys})),migration_count:migrations?.[0]?.results?.length}));
}
const output=process.argv[2]??'docs/deployment-audit.json';
writeFileSync(resolve(root,output),JSON.stringify(report,null,2)+'\n');
console.log(`Sanitized audit saved to ${output}`);
