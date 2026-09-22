import {ITEMS} from './items.js';
const $=id=>document.getElementById(id);let snapshot={};
const date=value=>value?new Date(value).toLocaleString():'Never';
const message=text=>$('message').textContent=text;
function line(parent,text){const p=document.createElement('div');p.className='meta';p.textContent=text;parent.append(p);}
async function refresh(){
  snapshot=await chrome.runtime.sendMessage({action:'status'});if(snapshot.error){message(snapshot.error);return;}
  $('toggle').textContent=snapshot.enabled?'Pause automatic checks':'Enable 5-minute checks';
  $('status').textContent=`${snapshot.enabled?'Monitoring enabled':'Automatic checks paused'} · Next check: ${date(snapshot.nextAt)} · Last complete pass: ${date(snapshot.lastRun?.completedAt)}`;
  $('cards').replaceChildren();
  for(const item of ITEMS){
    const entry=snapshot.history?.[item.asin],last=entry?.checks?.[0],verified=entry?.lastVerified;
    const card=document.createElement('article');card.className='card';
    const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noreferrer';link.textContent=item.asin;card.append(link);
    const h=document.createElement('h2');h.textContent=item.name;card.append(h);
    const state=document.createElement('p');state.className=`state ${last?.state||''}`;state.textContent=last?.state==='buying_options_shown'?'Buying options shown — click to see offers':(last?.state||'Not checked').replaceAll('_',' ').toUpperCase();card.append(state);
    if(last?.buyingOptionsShown){const offers=document.createElement('a');offers.href=item.url;offers.target='_blank';offers.rel='noreferrer';offers.textContent='Click to see offers on Amazon';card.append(offers);line(card,'Stock, price and seller are unverified.');}
    line(card,`Latest attempt: ${date(last?.observedAt)}`);line(card,`Result: ${last?.reason?.replaceAll('_',' ')||'Open product tabs, then check.'}`);
    line(card,`Last verified: ${verified?.state?.replaceAll('_',' ')||'None'} · ${date(verified?.observedAt)}`);
    if(verified?.priceMxn)line(card,`Last verified price: MX$${verified.priceMxn} · ${verified.seller||'Seller unknown'}`);
    line(card,`Verified checks: ${entry?.verified||0} / ${entry?.total||0}`);
    line(card,`Intake: ${snapshot.intakeMode==='local'?'Local only':last?.intake?.saved?'Saved to Spawn':last?.intake?.error||'Awaiting receipt'}`);
    if(!verified||Date.now()-Date.parse(verified.observedAt)>900000)line(card,'⚠ No verified evidence within the last 15 minutes.');
    $('cards').append(card);
  }
}
for(const action of ['open','check','toggle'])$(action).addEventListener('click',async()=>{
  $(action).disabled=true;message(action==='check'?'Checking 14 pages, two at a time; this may take up to three minutes…':'');
  try{const response=await chrome.runtime.sendMessage({action,enabled:!snapshot.enabled});message(response?.error||'');await refresh();}catch(error){message(error.message);}finally{$(action).disabled=false;}
});
$('export').addEventListener('click',async()=>{await refresh();const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),version:chrome.runtime.getManifest().version,items:ITEMS,...snapshot},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`garfield-amazon-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
await refresh();setInterval(refresh,10000);

