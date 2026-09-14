import {readWalmartOffer} from './walmart-extract.js';
import {ITEMS,exactItem,challengeUrl,quiet} from './walmart-schedule.js';
import {MERCADOLIBRE_ITEMS,exactMercadoLibreItem,mercadoLibreChallenge} from './mercadolibre-items.js';
import {readMercadoLibreOffer} from './mercadolibre-extract.js';
import {COLLECTOR_TOKEN} from './private-config.js';
import {appendObservation} from './history.js';
import {MERCADOLIBRE_COLLECTOR_TOKEN} from './mercadolibre-private-config.js';
import {sendMercadoLibreObservation} from './mercadolibre-transport.js';

const groups={
 walmart:{items:ITEMS,exact:exactItem,challenge:challengeUrl,extract:readWalmartOffer,patterns:['https://www.walmart.com.mx/*']},
 mercadolibre:{items:MERCADOLIBRE_ITEMS,exact:exactMercadoLibreItem,challenge:mercadoLibreChallenge,extract:readMercadoLibreOffer,patterns:['https://www.mercadolibre.com.mx/*','https://articulo.mercadolibre.com.mx/*']}
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let busy=false;
export async function restoreAlarms(){
 const state=await chrome.storage.local.get(['walmartEnabled','mercadolibreEnabled']);
 for(const retailer of Object.keys(groups)){
  const name=`${retailer}-warm`;
  if(state[`${retailer}Enabled`]){if(!await chrome.alarms.get(name))await chrome.alarms.create(name,{delayInMinutes:30,periodInMinutes:30});}
  else await chrome.alarms.clear(name);
 }
}
function unknown(item,reason,state='unknown'){
 return {itemId:item.itemId,url:item.url,title:'',state,reason,offerText:reason,priceMxn:null,seller:null,sellerId:null,postcode:null,purchaseEnabled:false,visibleItemId:null};
}
async function reload(id){
 await new Promise((resolve,reject)=>{
  const listener=(tabId,change)=>{if(tabId===id&&change.status==='complete')finish();};
  const timer=setTimeout(()=>finish(new Error('Reload timed out')),20000);
  function finish(error){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);error?reject(error):resolve();}
  chrome.tabs.onUpdated.addListener(listener);
  chrome.tabs.reload(id,{bypassCache:true}).catch(finish);
 });
 await delay(2000);
}
async function inspect(group,item,tab,automatic){
 if(!tab)return unknown(item,'TAB_MISSING');
 if(group.challenge(tab.url))return unknown(item,'ACCOUNT_VERIFICATION','blocked');
 if(!group.exact(tab.url,item))return unknown(item,'TAB_CHANGED');
 if(automatic)await reload(tab.id);
 const current=await chrome.tabs.get(tab.id);
 if(group.challenge(current.url))return unknown(item,'ACCOUNT_VERIFICATION','blocked');
 if(!group.exact(current.url,item))return unknown(item,'TAB_CHANGED');
 const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:group.extract,args:[item]});
 if(!result||result.error||result.itemId!==item.itemId)return unknown(item,'ACQUISITION_FAILED');
 return result;
}
async function persist(retailer,record){
 if(retailer==='mercadolibre')return sendMercadoLibreObservation(record,MERCADOLIBRE_COLLECTOR_TOKEN);
 if(!COLLECTOR_TOKEN)throw new Error('Walmart credential is not configured.');
 const response=await fetch('https://spawn.aztlan-eng.com/internal/walmart-browser/observe',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{authorization:`Bearer ${COLLECTOR_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(record)
 });
 if(!response.ok)throw new Error(`Spawn rejected the check (HTTP ${response.status}).`);
 return {...record,saved:true};
}
export async function run(retailer,automatic=false){
 const group=groups[retailer];
 if(!group)throw new Error('Unknown retailer.');
 if(busy)return {error:'A check is already running.'};
 busy=true;
 let leased=false;
 try{
  const key=`${retailer}Enabled`,state=await chrome.storage.local.get([key,'leaseUntil','tabIds','history']);
  if(automatic&&(!state[key]||quiet()))return {skipped:true};
  if(state.leaseUntil>Date.now())return {error:'Previous check still running; try again shortly.'};
  await chrome.storage.local.set({leaseUntil:Date.now()+300000});leased=true;
  const tabs=await chrome.tabs.query(automatic?{url:group.patterns}:{active:true,currentWindow:true});
  const selected=automatic?group.items:group.items.filter(item=>tabs.some(tab=>group.exact(tab.url,item)));
  if(!selected.length)throw new Error('Open an approved original product tab or one of the two supported Mercado Libre catalog pages first.');
  const tabIds=state.tabIds||{},results=[];let history=state.history||{};
  for(const item of selected){
   if(automatic&&(!(await chrome.storage.local.get(key))[key]||quiet()))break;
   let tab=tabs.find(t=>group.exact(t.url,item));
   if(!tab&&tabIds[item.itemId])tab=tabs.find(t=>t.id===tabIds[item.itemId]&&group.challenge(t.url));
   if(tab)tabIds[item.itemId]=tab.id;
   let observation;
   try{observation=await inspect(group,item,tab,automatic);}catch{observation=unknown(item,'ACQUISITION_FAILED','error');}
   const record={...observation,id:crypto.randomUUID(),observedAt:new Date().toISOString()};
   let result;try{result=await persist(retailer,record);}catch(error){result={...record,saved:false,error:error.message};}
   results.push(result);history=appendObservation(history,retailer,result);
   await chrome.storage.local.set({history,tabIds});
  }
  const lastRun={at:new Date().toISOString(),automatic,results};
  await chrome.storage.local.set({[`${retailer}LastRun`]:lastRun});
  await chrome.action.setBadgeText({text:results.some(r=>r.local||!r.saved||['unknown','blocked','error'].includes(r.state))?'!':''});
  return lastRun;
 }finally{if(leased)await chrome.storage.local.remove('leaseUntil');busy=false;}
}
chrome.runtime.onInstalled.addListener(()=>restoreAlarms());
chrome.runtime.onStartup.addListener(()=>restoreAlarms());
chrome.alarms.onAlarm.addListener(alarm=>{
 const retailer=Object.keys(groups).find(name=>alarm.name===`${name}-warm`);
 if(retailer)run(retailer,true).catch(error=>chrome.storage.local.set({[`${retailer}LastRun`]:{at:new Date().toISOString(),error:error.message}}));
});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||sender.tab||!groups[message?.retailer])return;
 const retailer=message.retailer;
 (async()=>{
  if(message.action==='check')return run(retailer);
  if(message.action==='toggle'){
   if(retailer==='walmart'&&message.enabled&&!COLLECTOR_TOKEN)throw new Error('Walmart credential is not configured.');
   await chrome.storage.local.set({[`${retailer}Enabled`]:message.enabled===true});await restoreAlarms();
  }else if(message.action!=='status')throw new Error('Unknown action.');
  const s=await chrome.storage.local.get([`${retailer}Enabled`,`${retailer}LastRun`]);
  return {enabled:!!s[`${retailer}Enabled`],reportingToSpawn:retailer==='mercadolibre'?!!MERCADOLIBRE_COLLECTOR_TOKEN:!!COLLECTOR_TOKEN,lastRun:s[`${retailer}LastRun`],nextAt:(await chrome.alarms.get(`${retailer}-warm`))?.scheduledTime||null};
 })().then(respond).catch(error=>respond({error:error.message}));return true;
});
