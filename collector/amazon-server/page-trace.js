import {diagnostic,diagnosticContext} from './diagnostics.js';
const stages=new Set(['panel_opening','panel_reading','panel_timeout','entered','identity','title','asin','buybox','options','availability','purchase','price','seller','delivery','classify','returned']);
const pending=new Map();
export function beginPageTrace(tabId,item){
  const trace={context:diagnosticContext(),id:crypto.randomUUID(),asin:item.asin,url:item.url,startedAt:Date.now(),closed:false,seen:new Set()};
  pending.set(tabId,trace);
  // Keep the most recent traces bounded, including ones whose tabs were closed.
  if(pending.size>32)pending.delete(pending.keys().next().value);
  return trace.id;
}
export function endPageTrace(tabId,id){const trace=pending.get(tabId);if(trace?.id===id)trace.closed=true;}
export function receivePageTrace(message,sender){
  if(message?.action!=='page-trace')return false;
  const trace=pending.get(sender.tab?.id);
  if(sender.id!==browser.runtime.id||sender.frameId!==0||!trace||message.traceId!==trace.id||Date.now()-trace.startedAt>120000||!stages.has(message.stage)||trace.seen.has(message.stage))return true;
  try{const url=new URL(sender.url);if(url.origin!=='https://www.amazon.com.mx'||url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase()!==trace.asin)return true;}catch{return true;}
  trace.seen.add(message.stage);
  void diagnostic('PAGE_TRACE',{...trace.context,asin:trace.asin,traceId:trace.id,stage:message.stage,late:trace.closed,elapsedMs:Date.now()-trace.startedAt,
    readyState:['loading','interactive','complete'].includes(message.readyState)?message.readyState:'unknown',
    visibility:['visible','hidden'].includes(message.visibility)?message.visibility:'unknown'});
  return true;
}
