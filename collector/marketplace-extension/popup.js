import {MERCADOLIBRE_ITEMS} from './mercadolibre-items.js';
const select=document.querySelector('#retailer'),out=document.querySelector('#result'),toggle=document.querySelector('#toggle'),check=document.querySelector('#check');
let enabled=false,reportingToSpawn=false;
async function request(action){
 let timer;
 try{
  const result=await Promise.race([chrome.runtime.sendMessage({...action,retailer:select.value}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tracker did not respond. Reload Garfield Marketplace Observer at edge://extensions, then reopen this popup.')),action.action==='check'?45000:5000);})]);
  if(!result)throw new Error('Tracker is unavailable. Reload the extension at edge://extensions.');
  return result;
 }finally{clearTimeout(timer);}
}
function render(run){out.textContent=run?.error||(run?.results||[]).map(r=>`${r.itemId}: ${r.pageAvailability==='sold_out'?'Page shows SOLD OUT · original offer unverified':r.state.toUpperCase()}\n${r.seller||'Seller not confirmed'}${r.sellerId?` (ID ${r.sellerId})`:''}\n${r.priceMxn?`MX$${r.priceMxn} · `:''}${r.reason||''}\n${r.local?'Local preview — no customer alert':r.saved?'Saved to Spawn':r.error}\n${new Date(r.observedAt).toLocaleString()}`).join('\n\n');}
async function refresh(){
 renderInfo();
 document.querySelector('#schedule').textContent='Connecting to tracker…';
 const state=await request({action:'status'});if(state.error)throw new Error(state.error);
 reportingToSpawn=!!state.reportingToSpawn;renderInfo();
 enabled=state.enabled;toggle.textContent=enabled?'Pause automatic checks':'Enable 30-minute checks';
 document.querySelector('#schedule').textContent=enabled?`Checks ON · next ${state.nextAt?new Date(state.nextAt).toLocaleTimeString():'pending'}`:'Automatic checks OFF';
 render(state.lastRun);
}
function renderInfo(){
 document.querySelector('#notice').textContent=select.value==='mercadolibre'?`Seller reference: MERCADOLIBRE HOME_MX (Tienda oficial Pokemon). Numeric seller ID still needs verification. Full indicates fulfillment, not seller identity. ${reportingToSpawn?'Spawn reporting configured — check each result for delivery confirmation. No customer alerts.':'Local pilot — results stay on this computer.'}`:'Walmart sends observations to Spawn when its separate credential is configured.';
 const links=document.querySelector('#links');links.replaceChildren();
 if(select.value==='mercadolibre')for(const item of MERCADOLIBRE_ITEMS){const a=document.createElement('a');a.href=item.catalogUrl||item.url;a.textContent=item.name;a.target='_blank';a.rel='noopener';links.append(a);}
}
async function action(button,payload){check.disabled=toggle.disabled=select.disabled=true;try{const result=await request(payload);if(result.error)throw new Error(result.error);await refresh();if(payload.action==='check')render(result);}catch(error){out.textContent=error.message;}finally{check.disabled=toggle.disabled=select.disabled=false;}}
check.onclick=()=>action(check,{action:'check'});toggle.onclick=()=>action(toggle,{action:'toggle',enabled:!enabled});select.onchange=()=>refresh().catch(error=>out.textContent=error.message);
refresh().catch(error=>out.textContent=error.message);
