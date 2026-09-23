// Local, bounded metadata only: never store credentials, page contents or raw errors.
let queue=Promise.resolve();
export function diagnostic(type,details={}){
  const event={at:new Date().toISOString(),type,...details};
  queue=queue.then(async()=>{
    const {diagnostics=[]}=await chrome.storage.local.get('diagnostics');
    await chrome.storage.local.set({diagnostics:[event,...diagnostics].slice(0,500)});
  }).catch(()=>{}); // Diagnostic storage failure must not stop monitoring.
  return queue;
}
export function errorCategory(error){
  const text=String(error?.message||error||'');
  if(/timed out|timeout|aborted/i.test(text))return 'TIMEOUT';
  if(/No tab|closed|removed/i.test(text))return 'TAB_CLOSED';
  if(/permission|Cannot access|host permission/i.test(text))return 'PAGE_ACCESS_DENIED';
  if(/quota/i.test(text))return 'STORAGE_QUOTA';
  if(/Intake HTTP \d{3}/.test(text))return text.match(/Intake HTTP \d{3}/)[0];
  return 'API_OR_RUNTIME_ERROR';
}
export function healthSummary(snapshot,now=Date.now()){
  if(!snapshot.enabled)return 'Paused';
  if(snapshot.activeRun){
    const age=now-Date.parse(snapshot.activeRun.at);
    return `${age>270000?'Interrupted or stalled check':'Check in progress'} — ${snapshot.activeRun.phase}${snapshot.activeRun.asin?' · '+snapshot.activeRun.asin:''}`;
  }
  if(!snapshot.nextAt)return 'Schedule missing — no alarm registered';
  if(now-snapshot.nextAt>60000)return 'Scheduled check overdue — browser delay or interruption; cause unconfirmed';
  const completed=Date.parse(snapshot.lastRun?.completedAt||'');
  if(!completed||now-completed>900000)return 'Monitoring stale — no complete pass within 15 minutes';
  return 'Recent complete pass — inspect product results and intake receipts below';
}
