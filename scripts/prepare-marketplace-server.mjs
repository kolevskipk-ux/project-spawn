import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const source=resolve('collector/marketplace-extension'),output=resolve(process.argv[2]||'../work/Scout-Marketplace-Server-0.4.2');
mkdirSync(output,{recursive:true});
for(const file of readdirSync(source)){
 if(!/\.(js|html|mjs)$/.test(file)||file.includes('private-config'))continue;
 writeFileSync(resolve(output,file),readFileSync(resolve(source,file),'utf8').replace(/\r\n/g,'\n').replaceAll('chrome.','browser.').replaceAll('globalThis.chrome','globalThis.browser'));
}
writeFileSync(resolve(output,'private-config.js'),"export const COLLECTOR_TOKEN = '';\n");
writeFileSync(resolve(output,'mercadolibre-private-config.js'),"export const MERCADOLIBRE_COLLECTOR_TOKEN = '';\n");
const manifest=JSON.parse(readFileSync(resolve(source,'manifest.json'),'utf8'));
Object.assign(manifest,{name:'Scout Marketplace — Firefox server',version:'0.4.2',background:{scripts:['background.js'],type:'module'},browser_specific_settings:{gecko:{id:'scout-marketplace-server@aztlan-eng.com',strict_min_version:'142.0',data_collection_permissions:{required:['websiteContent']}}}});
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const background=resolve(output,'background.js');
let code=readFileSync(background,'utf8').replace("sender.tab||!groups", "sender.tab&&sender.url!==browser.runtime.getURL('popup.html')||!groups");
code=code.replace('if(automatic)await reload(tab.id);',"if(automatic){await browser.tabs.update(tab.id,{active:true});await reload(tab.id);}");
code=code.replace("const [{result}]=await browser.scripting.executeScript({target:{tabId:tab.id},func:group.extract,args:[item]});\n if(!result||result.error||result.itemId!==item.itemId)return unknown(item,'ACQUISITION_FAILED');\n return result;",`let result;
 const until=Date.now()+6000;
 do {
  [{result}]=await browser.scripting.executeScript({target:{tabId:tab.id},func:group.extract,args:[item]});
  const pending=result?.error||result?.reason==='PRIMARY_OFFER_MISSING'||result?.offerText==='No unambiguous primary Walmart offer area found';
  if(!pending)break;
  if(Date.now()>=until)break;
  await delay(1000);
 }while(true);
 if(!result||result.error||result.itemId!==item.itemId)return unknown(item,'ACQUISITION_FAILED');
 return result;`);
const mlItems=resolve(output,'mercadolibre-items.js');
writeFileSync(mlItems,readFileSync(mlItems,'utf8').replace('gz\\/account-verification|jms\\/|login|auth|security|challenge','gz\\/account-verification|captcha(?:\\/|$)|jms\\/|login|auth|security|challenge'));
code+=`
// Owner-authorized server commissioning. Restarts preserve manual disablement.
if(typeof browser.tabs.create==='function')setTimeout(async()=>{
 try{
  const state=await browser.storage.local.get(['marketplaceServerCommissioned','tabIds']),tabIds=state.tabIds||{};
  for(const group of Object.values(groups)){
   const tabs=await browser.tabs.query({url:group.patterns});
   for(const item of group.items){
    const existing=tabs.find(tab=>group.exact(tab.url,item)||group.challenge(tab.url)&&(tabIds[item.itemId]===tab.id||group.exact(new URL(tab.url).searchParams.get('go_url'),item)));
    const tab=existing||await browser.tabs.create({url:item.catalogUrl||item.url,active:false});tabIds[item.itemId]=tab.id;
   }
  }
  await browser.storage.local.set({tabIds});
  // Firefox may expose a newly created tab before its product URL commits.
  const navigationDeadline=Date.now()+20000;
  while(Date.now()<navigationDeadline){
   const tabs=await browser.tabs.query({});
   if(Object.values(groups).every(group=>group.items.every(item=>tabs.some(tab=>tab.id===tabIds[item.itemId]&&(group.exact(tab.url,item)||group.challenge(tab.url))))))break;
   await delay(1000);
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
