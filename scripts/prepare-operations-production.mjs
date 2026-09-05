// Generates a reviewable config only. Does not deploy or contact Cloudflare.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const audience=process.argv[2];
const staging=JSON.parse(readFileSync(new URL('../wrangler.ops-staging.jsonc',import.meta.url),'utf8'));
if(!audience || !/^[a-f0-9]{64}$/.test(audience) || audience===staging.vars.OPS_ACCESS_AUD) {
  throw new Error('Supply the actual 64-character AUD of the approved PRODUCTION Access application, never the staging AUD.');
}
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
if(config.name!=='project-spawn'||config.d1_databases?.[0]?.database_id!=='8fd44e8d-9ffc-4f9b-8c2c-f6ba1a9827aa')throw new Error('Unexpected production Worker/database; review configuration manually.');
Object.assign(config.vars,{
  OPS_AUTH_MODE:'access',
  OPS_ACCESS_ISSUER:'https://hidden-shadow-9100.cloudflareaccess.com',
  OPS_ACCESS_AUD:audience,
  OPS_OWNER_EMAIL:'phil.kolevski@gmail.com',
  OPS_ENVIRONMENT:'Production · live data',
});
const output=new URL('../wrangler.ops-production.generated.jsonc',import.meta.url);
writeFileSync(output,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
console.log(`Prepared ${fileURLToPath(output)}. Review the diff before deployment. No remote changes made.`);
