// Overlay only the continuation files on the existing server upgrade output.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const source=resolve(process.argv[2]||'../work/Scout-Amazon-Upgrades-0.5.6');
const output=resolve(process.argv[3]||'../work/Scout-Amazon-Continuation-0.5.7');
mkdirSync(output,{recursive:true});
for(const name of ['extract.js','read-tab.js','product-check.js']){
 writeFileSync(resolve(output,name),readFileSync(new URL('../collector/amazon-server/'+name,import.meta.url)));
}
const manifest=JSON.parse(readFileSync(resolve(source,'manifest.json'),'utf8'));
if(manifest.version!=='0.5.6')throw Error('Expected deployed server 0.5.6 manifest');
manifest.version='0.5.7';
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({version:manifest.version,output,credentialsIncluded:false,existingPacingAndRecovery:'untouched'}));
