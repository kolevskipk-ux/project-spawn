// Public overlay only. Never read or copy private-config.js or the Firefox profile.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';
const source=resolve(process.argv[2]),output=resolve(process.argv[3]);
const manifest=JSON.parse(readFileSync(resolve(source,'manifest.json'),'utf8'));
if(manifest.version!=='0.5.9')throw Error('Expected commissioned 0.5.9 package');
mkdirSync(output,{recursive:true});
const original=readFileSync(resolve(source,'items.js'),'utf8');
writeFileSync(resolve(output,'base-items.js'),original);
writeFileSync(resolve(output,'items.js'),"export {exact,append} from './base-items.js';\nexport {ITEMS} from './catalog-sync.js';\n");
writeFileSync(resolve(output,'catalog-sync.js'),readFileSync(new URL('../collector/amazon-server/catalog-sync.js',import.meta.url)));
let background=readFileSync(resolve(source,'background.js'),'utf8');
const start="if(busy)return {error:'Check already running.'};busy=true;";
if(!background.includes(start)||!background.includes('await openProducts();'))throw Error('Unexpected server background; patch refused');
background="import {ensureCatalog} from './catalog-sync.js';\n"+background;
background=background.replace(start,"if(busy)return {error:'Check already running.'};if(!await ensureCatalog()){await browser.storage.local.set({nextRunAt:Date.now()+60000});await restoreSchedule();return {skipped:true,reason:'CATALOG_UNAVAILABLE'};}if(busy)return {error:'Check already running.'};busy=true;");
background=background.replaceAll('await openProducts();','if(await ensureCatalog())await openProducts();');
writeFileSync(resolve(output,'background.js'),background);
manifest.version='0.6.0';writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version:manifest.version,files:['base-items.js','items.js','catalog-sync.js','background.js','manifest.json'],credentialsIncluded:false}));
