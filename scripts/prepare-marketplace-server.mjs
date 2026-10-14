import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const source=resolve('collector/marketplace-extension'),output=resolve(process.argv[2]||'../work/Scout-Marketplace-Server-0.4.1');
mkdirSync(output,{recursive:true});
for(const file of readdirSync(source)){
 if(!/\.(js|html|mjs)$/.test(file)||file.includes('private-config'))continue;
 writeFileSync(resolve(output,file),readFileSync(resolve(source,file),'utf8').replaceAll('chrome.','browser.').replaceAll('globalThis.chrome','globalThis.browser'));
}
writeFileSync(resolve(output,'private-config.js'),"export const COLLECTOR_TOKEN = '';\n");
writeFileSync(resolve(output,'mercadolibre-private-config.js'),"export const MERCADOLIBRE_COLLECTOR_TOKEN = '';\n");
const manifest=JSON.parse(readFileSync(resolve(source,'manifest.json'),'utf8'));
Object.assign(manifest,{name:'Scout Marketplace — Firefox server',version:'0.4.1',background:{scripts:['background.js'],type:'module'},browser_specific_settings:{gecko:{id:'scout-marketplace-server@aztlan-eng.com',strict_min_version:'142.0',data_collection_permissions:{required:['websiteContent']}}}});
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const background=resolve(output,'background.js');
let code=readFileSync(background,'utf8').replace("sender.tab||!groups", "sender.tab&&sender.url!==browser.runtime.getURL('popup.html')||!groups");
code+=`
// Owner-authorized server commissioning. Restarts preserve manual disablement.
if(typeof browser.tabs.create==='function')setTimeout(async()=>{
 try{
  const state=await browser.storage.local.get('marketplaceServerCommissioned');
  for(const group of Object.values(groups)){
   const tabs=await browser.tabs.query({url:group.patterns});
   for(const item of group.items)if(!tabs.some(tab=>group.exact(tab.url,item)))await browser.tabs.create({url:item.catalogUrl||item.url,active:false});
  }
  if(!state.marketplaceServerCommissioned)await browser.storage.local.set({marketplaceServerCommissioned:true,walmartEnabled:true,mercadolibreEnabled:true});
  await restoreAlarms();
  for(const retailer of Object.keys(groups))await run(retailer,true);
  await browser.tabs.create({url:browser.runtime.getURL('popup.html')});
 }catch(error){console.error('Marketplace commissioning failed:',error.message);}
},5000);
`;
writeFileSync(background,code);
console.log(JSON.stringify({output,version:manifest.version,credentialsIncluded:false}));
