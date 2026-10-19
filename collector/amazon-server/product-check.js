import {withDeadline} from './deadline.js';
import {readTab} from './read-tab.js';
import {productTab} from './product-tab.js';
import {diagnostic} from './diagnostics.js';

export async function checkProduct(item,foreground,config){
 const deadlineAt=Date.now()+20000;
 const remaining=()=>{const ms=deadlineAt-Date.now();if(ms<=0)throw new Error('Product timed out');return ms;};
 const bounded=fn=>{const ms=remaining();return withDeadline(fn(),ms,'Product');};
 const empty={asin:item.asin,url:item.url,state:'unknown',reason:'TAB_MISSING',buyingOptionsShown:null};
 const tab=await bounded(()=>productTab(item));
 if(!tab)return {...empty,state:'blocked',reason:'UNASSIGNED_CHALLENGE_TAB'};
 await bounded(()=>foreground.activate(tab,item.asin,deadlineAt));
 await bounded(()=>diagnostic('RELOAD_STARTED',{asin:item.asin,discarded:!!tab.discarded}));
 await new Promise((resolve,reject)=>{
  let finished=false;
  const done=error=>{if(finished)return;finished=true;clearTimeout(timer);browser.tabs.onUpdated.removeListener(listener);error?reject(error):resolve();};
  const listener=(id,change)=>{if(id===tab.id&&change.status==='complete')done();};
  const timer=setTimeout(()=>done(new Error('Product reload timed out')),remaining());
  browser.tabs.onUpdated.addListener(listener);
  browser.tabs.reload(tab.id,{bypassCache:true}).catch(done);
 });
 await bounded(()=>new Promise(resolve=>setTimeout(resolve,2500)));
 await bounded(()=>diagnostic('RELOAD_COMPLETED',{asin:item.asin}));
 const current=await bounded(()=>browser.tabs.get(tab.id));
 // A same-origin shopping gate may redirect away from /dp before extraction.
 // The reader still requires URL ASIN, DOM ASIN and matching product title.
 if(!current.url?.startsWith('https://www.amazon.com.mx/'))return {...empty,state:'blocked',reason:'REDIRECTED_OR_CHALLENGED'};
 return bounded(()=>readTab(tab.id,item,{...config,deadlineAt}));
}
