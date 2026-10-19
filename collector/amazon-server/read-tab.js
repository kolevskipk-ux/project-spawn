import {readAmazon} from './extract.js';
import {withDeadline} from './deadline.js';
import {beginPageTrace,endPageTrace} from './page-trace.js';
import {diagnostic,errorCategory} from './diagnostics.js';

// All waiting occurs in the worker. Injected functions take one synchronous snapshot.
export async function readTab(tabId,item,{inspectPanels=false,deadlineAt=Infinity}={}){
  async function step(name,timeoutMs){
    timeoutMs=Math.min(timeoutMs,deadlineAt-Date.now());if(timeoutMs<=0)throw new Error("Product timed out");
    const traceId=beginPageTrace(tabId,item);
    await diagnostic('EXTRACTION_STARTED',{asin:item.asin,traceId,step:name,injectImmediately:true});
    try{
      const outputs=await withDeadline(browser.scripting.executeScript({target:{tabId},func:readAmazon,args:[item,traceId,Math.min(deadlineAt,Date.now()+timeoutMs),name]}),timeoutMs,`Extraction ${name}`);
      await diagnostic('EXTRACTION_COMPLETED',{asin:item.asin,traceId,step:name});
      return outputs[0]?.result||{asin:item.asin,url:item.url,state:'error',reason:'NO_RESULT'};
    }catch(error){
      await diagnostic('EXTRACTION_FAILED',{asin:item.asin,traceId,step:name,error:errorCategory(error)});
      throw error;
    }finally{endPageTrace(tabId,traceId);}
  }
  let main=await step('main',15000);
  if(main.gateType==='continue_shopping'){
    const fallback={...main,continuationAttempted:true};
    try{
      await diagnostic('CONTINUE_SHOPPING_ATTEMPT',{asin:item.asin});
      // Clicking a submit button can destroy the injected context during navigation.
      try{await step('continue',2000);}catch{await diagnostic('CONTINUE_NAVIGATION_PENDING',{asin:item.asin});}
      await withDeadline(new Promise(resolve=>setTimeout(resolve,2500)),Math.min(3000,deadlineAt-Date.now()),'Continue shopping navigation');
      main=await step('main',5000);
      if(main.gateType==='continue_shopping')return fallback;
    }catch{return fallback;}
  }
  if(main.panelStatus!=='pending')return main;
  if(!inspectPanels){
    await diagnostic('PANEL_INSPECTION_SKIPPED',{asin:item.asin,reason:'DETECTION_ONLY'});
    return {...main,panelStatus:'skipped',panelSkipReason:'DETECTION_ONLY',priority:'normal'};
  }
  let fallback={...main,panelStatus:'unverified'},attempts=0;
  const end=Date.now()+8000;
  try{
    const opened=await step('open',Math.min(2000,end-Date.now()));
    if(opened.state==='blocked'||opened.priority==='high')return opened;
    if(opened.panelStatus!=='opening')return {...fallback,panelFailure:'OPEN_NOT_CONFIRMED'};
    while(Date.now()<end){
      await new Promise(resolve=>setTimeout(resolve,250));
      const remaining=end-Date.now();if(remaining<=0)break;
      attempts++;
      const result=await step('panel',Math.min(2000,remaining));
      if(result.state==='blocked'||result.priority==='high'||result.panelStatus==='inspected')return result;
      if(result.panelStatus==='unverified')fallback=result;
      else return {...fallback,panelFailure:result.reason||'IDENTITY_CHANGED'};
      // A partial loaded panel is a completed read, not a reason to poll repeatedly.
      if(result.offers?.length)return result;
    }
    await diagnostic('PANEL_WAIT_EXPIRED',{asin:item.asin,attempts});
    return {...fallback,panelFailure:'PANEL_NOT_READY',panelReadAttempts:attempts};
  }catch(error){
    // Stop on a stalled injected snapshot; don't pile up more pending injections.
    return {...fallback,panelFailure:errorCategory(error),panelReadAttempts:attempts};
  }
}
