import {ITEMS,exact,append} from './items.js';
import {readAmazon} from './extract.js';
import {AMAZON_COLLECTOR_TOKEN} from './private-config.js';
import {sendObservation} from './transport.js';
const ALARM='amazon-check',MINUTES=5;
let busy=false;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function restore(){
  const {enabled}=await chrome.storage.local.get('enabled');
  if(enabled){if(!await chrome.alarms.get(ALARM))await chrome.alarms.create(ALARM,{delayInMinutes:MINUTES,periodInMinutes:MINUTES});}
  else await chrome.alarms.clear(ALARM);
}
async function reload(id){
  await new Promise((resolve,reject)=>{
    const done=error=>{clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);error?reject(error):resolve();};
    const listener=(tabId,change)=>{if(tabId===id&&change.status==='complete')done();};
    const timer=setTimeout(()=>done(new Error('Page reload timed out')),20000);
    chrome.tabs.onUpdated.addListener(listener);chrome.tabs.reload(id,{bypassCache:true}).catch(done);
  });
  await wait(2500);
}
export async function run(automatic=false){
  if(busy)return {error:'A check is already running.'};busy=true;let leased=false;
  try{
    const initial=await chrome.storage.local.get(['enabled','leaseUntil','history']);
    if(automatic&&!initial.enabled)return {skipped:true};
    if(initial.leaseUntil>Date.now())return {error:'Previous check still finishing. Retry shortly.'};
    await chrome.storage.local.set({leaseUntil:Date.now()+270000});leased=true;
    const startedAt=new Date().toISOString();let history=initial.history||{};const results=[];
    for(let offset=0;offset<ITEMS.length;offset+=2){
      if(automatic&&!(await chrome.storage.local.get('enabled')).enabled)break;
      const batch=await Promise.all(ITEMS.slice(offset,offset+2).map(async item=>{
      const started=Date.now();let observation={asin:item.asin,url:item.url,state:'unknown',reason:'TAB_MISSING'};
      try{
        const tabs=await chrome.tabs.query({url:'https://www.amazon.com.mx/*'});
        const tab=tabs.find(t=>exact(t.url,item));
        if(tab){
          await reload(tab.id);
          const current=await chrome.tabs.get(tab.id);
          if(!exact(current.url,item))observation={...observation,state:'blocked',reason:'REDIRECTED_OR_CHALLENGED'};
          else {
            const outputs=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readAmazon,args:[item]});
            observation=outputs[0]?.result||{...observation,reason:'NO_RESULT'};
          }
        }
      }catch{observation={...observation,state:'error',reason:'PAGE_CHECK_FAILED'};}
      return {item,record:{...observation,id:crypto.randomUUID(),observedAt:new Date().toISOString(),durationMs:Date.now()-started,automatic}};
      }));
      // Persist sequentially so concurrent tab reads cannot overwrite history.
      for(const {item,record} of batch){
      const prior=history[item.asin]?.lastVerified;
      const priorOptions=history[item.asin]?.lastOptionsPresence;
      try{record.intake=await sendObservation(record,AMAZON_COLLECTOR_TOKEN);}catch(error){record.intake={mode:'spawn',saved:false,error:error.message};}
      history[item.asin]=append(history[item.asin],record);results.push(record);
      await chrome.storage.local.set({history,lastProgressAt:record.observedAt});
      if(record.state==='available'&&prior?.state!=='available'){
        try{await chrome.notifications.create(`offer-${item.asin}`,{type:'basic',iconUrl:'icon.png',title:`Available: ${item.name}`,message:`MX$${record.priceMxn} · ${record.seller}. Local pilot — verify the offer before buying.`});record.notification='sent';}
        catch{record.notification='failed';}
        await chrome.storage.local.set({history});
      }
      if(record.buyingOptionsShown===true&&priorOptions!==true){
        try{await chrome.notifications.create(`offer-${item.asin}`,{type:'basic',iconUrl:'icon.png',title:item.name,message:'Buying options shown — click to see offers. Stock, price and seller are unverified.'});record.notification='sent';}catch{record.notification='failed';}
        await chrome.storage.local.set({history});
      }
      }
    }
    const lastRun={startedAt,completedAt:new Date().toISOString(),automatic,results};
    await chrome.storage.local.set({lastRun});
    await chrome.action.setBadgeText({text:results.some(r=>r.state==='buying_options_shown')?'OPT':results.some(r=>r.state==='available')?'BUY':results.some(r=>!['available','sold_out'].includes(r.state))?'!':'OK'});
    return lastRun;
  }finally{if(leased)await chrome.storage.local.remove('leaseUntil');busy=false;}
}
export async function openProducts(){
  const tabs=await chrome.tabs.query({url:'https://www.amazon.com.mx/*'});
  for(const item of ITEMS)if(!tabs.some(tab=>exact(tab.url,item)))await chrome.tabs.create({url:item.url,active:false});
}
async function dashboard(){
  const url=chrome.runtime.getURL('dashboard.html');
  const tabs=await chrome.tabs.query({url});
  if(tabs[0])await chrome.tabs.update(tabs[0].id,{active:true});else await chrome.tabs.create({url});
}
chrome.action.onClicked.addListener(()=>dashboard());
chrome.runtime.onInstalled.addListener(()=>restore());
chrome.runtime.onStartup.addListener(()=>restore());
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)run(true).catch(()=>chrome.storage.local.set({lastError:'Scheduled check interrupted',lastErrorAt:new Date().toISOString()}));});
chrome.notifications.onClicked.addListener(id=>{const item=ITEMS.find(i=>id===`offer-${i.asin}`);if(item)chrome.tabs.create({url:item.url});});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('dashboard.html'))return;
  (async()=>{
    if(message.action==='check')return run();
    if(message.action==='open')await openProducts();
    else if(message.action==='toggle'){await chrome.storage.local.set({enabled:message.enabled===true});await restore();}
    else if(message.action!=='status')throw new Error('Unsupported action');
    return {...await chrome.storage.local.get(['enabled','history','lastRun','lastError','lastErrorAt','leaseUntil']),intakeMode:AMAZON_COLLECTOR_TOKEN?'spawn':'local',nextAt:(await chrome.alarms.get(ALARM))?.scheduledTime||null};
  })().then(respond).catch(error=>respond({error:error.message}));return true;
});
