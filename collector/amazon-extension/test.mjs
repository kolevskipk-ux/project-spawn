import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ITEMS,exact,append} from './items.js';
import {readAmazon} from './extract.js';
const require=createRequire('C:/Users/Philip/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
let cases=0;
try{
 const page=await browser.newPage();let fixture='';
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
 const item=ITEMS[3];
 const identity=`<span id="productTitle">Pokémon TCG 30th Celebration Booster Bundle</span><input id="ASIN" value="${item.asin}">`;
 const offer='<div id="desktop_buybox"><span id="availability">Disponible</span><span class="a-price"><span class="a-offscreen">$589.25</span></span><a id="sellerProfileTriggerId">Amazon México</a><input id="add-to-cart-button" type="submit" value="Agregar al carrito"></div>';
 async function check(html,expected,reason,url=item.url){fixture=html;await page.goto(url);const r=await page.evaluate(readAmazon,item);assert.equal(r.state,expected,JSON.stringify(r));if(reason)assert.equal(r.reason,reason);cases++;return r;}
 let r=await check(identity+offer,'available');assert.equal(r.priceMxn,589.25);assert.equal(r.seller,'Amazon México');
 await check(identity+offer.replace('Disponible','Temporalmente agotado'),'unknown','CONTRADICTORY_OFFER');
 await check(identity+offer.replace('Disponible','Temporalmente agotado').replace('type="submit"','type="submit" disabled'),'sold_out');
 await check(identity+offer.replace('Disponible','No disponible por el momento').replace('type="submit"','type="submit" style="display:none"'),'sold_out');
 await check(identity+offer.replace('id="sellerProfileTriggerId"','id="unrelated"'),'unknown','PRICE_OR_SELLER_UNCONFIRMED');
 await check(identity+offer.replace('$589.25',''),'unknown','PRICE_OR_SELLER_UNCONFIRMED');
 await check(identity.replace(item.asin,'B000000000')+offer,'unknown','PRODUCT_IDENTITY_UNCONFIRMED');
 await check(identity.replace('Booster Bundle','Unrelated item')+offer,'unknown','PRODUCT_IDENTITY_UNCONFIRMED');
 await check(identity+offer,'unknown','PRODUCT_IDENTITY_UNCONFIRMED','https://www.amazon.com.mx/dp/B000000000');
 await check('<input id="captchacharacters">','blocked');
 await check(identity+offer.replace('type="submit"','type="submit" disabled'),'unknown','NO_VERIFIED_FEATURED_OFFER');
 await check(identity+offer.replace('Disponible','No hay ofertas destacadas').replace('type="submit"','type="submit" disabled'),'unknown');
 await check(identity+offer.replace('Disponible','Disponible').replace('</div>','<div id="deliveryBlockMessage">No podemos enviar a tu ubicación</div></div>'),'unknown','DELIVERY_UNAVAILABLE');
 await check(identity+offer.replace('id="desktop_buybox"','id="recommendations"'),'unknown');
 await check(identity+offer.replace('id="desktop_buybox"','id="desktop_buybox" style="display:none"'),'unknown');
 await check(identity+offer.replace('id="sellerProfileTriggerId"','id="sellerProfileTriggerId" style="display:none"'),'unknown');
 const control=`<a href="/gp/offer-listing/${item.asin}">Ver todas las opciones de compra</a>`;
 const withOptions=identity+offer.replace('</div>',control+'</div>');
 r=await check(withOptions,'buying_options_shown','BUYING_OPTIONS_CONTROL_VISIBLE');assert.equal(r.buyingOptionsShown,true);assert.equal(r.priceMxn,null);assert.equal(r.seller,null);
 await check(withOptions.replace('Disponible','Temporalmente agotado'),'buying_options_shown');
 await check(withOptions.replace('Ver todas las opciones de compra','See All Buying Options'),'buying_options_shown');
 await check(withOptions.replace('<a href="/gp/offer-listing/','<a style="display:none" href="/gp/offer-listing/'),'available');
 await check(withOptions.replace('<a href="/gp/offer-listing/','<a aria-disabled="true" href="/gp/offer-listing/'),'available');
 await check(identity+offer+control,'available');
 await check(withOptions.replace(`/gp/offer-listing/${item.asin}`,'/gp/offer-listing/B000000000'),'available');
 await check(withOptions.replace(`/gp/offer-listing/${item.asin}`,'https://evil.example/offers'),'available');
 await check(withOptions.replace(`<input id="ASIN" value="${item.asin}">`,''),'unknown','PRODUCT_IDENTITY_UNCONFIRMED');
}finally{await browser.close();}
assert(exact(ITEMS[0].url,ITEMS[0]));assert(!exact(ITEMS[0].url.replace('amazon.com.mx','amazon.com.mx.evil.test'),ITEMS[0]));
let entry=append(null,{state:'available',observedAt:'2026-09-22T00:00:00Z'});
entry=append(entry,{state:'blocked'});assert.equal(entry.lastVerified.state,'available');assert.equal(entry.verified,1);assert.equal(entry.total,2);
entry=append(entry,{state:'buying_options_shown',buyingOptionsShown:true});assert.equal(entry.lastVerified.state,'available');assert.equal(entry.lastOptionsPresence,true);
entry=append(entry,{state:'blocked',buyingOptionsShown:null});assert.equal(entry.lastOptionsPresence,true);
entry=append(entry,{state:'unknown',buyingOptionsShown:false});assert.equal(entry.lastOptionsPresence,false);
const {sendObservation,intakeRecord}=await import('./transport.js');
const transportRecord={id:'sample-id',asin:ITEMS[0].asin,state:'buying_options_shown',buyingOptionsShown:true,accountEmail:'not retained'};
assert.equal((await sendObservation(transportRecord,'',()=>{throw new Error('Unexpected fetch');})).mode,'local');
assert.equal(intakeRecord(transportRecord).accountEmail,undefined);
assert((await sendObservation(transportRecord,'scoped-token',async(url,options)=>{assert.equal(url,'https://spawn.aztlan-eng.com/internal/amazon-browser/observe');assert.equal(options.redirect,'error');return Response.json({ok:true,id:'sample-id',inventoryUpdated:false,customerAlertSent:false});})).saved);
await assert.rejects(sendObservation(transportRecord,'scoped-token',async()=>Response.json({ok:true,id:'wrong'})),/did not confirm/);
await assert.rejects(sendObservation(transportRecord,'scoped-token',async()=>new Response('',{status:401})),/HTTP 401/);
const storage={},alarms=new Map();let notifications=0;
globalThis.chrome={
 storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,storage[k]])),set:async values=>Object.assign(storage,values),remove:async key=>delete storage[key]}},
 alarms:{get:async key=>alarms.get(key),create:async(key,v)=>alarms.set(key,v),clear:async key=>alarms.delete(key),onAlarm:{addListener(){}}},
 tabs:{query:async()=>[]},action:{setBadgeText:async()=>{},onClicked:{addListener(){}}},
 notifications:{create:async()=>{notifications++;},onClicked:{addListener(){}}},
 runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(){}}}
};
const {restore,run}=await import('./background.js');
await restore();assert.equal(alarms.size,0);assert((await run(true)).skipped);
storage.enabled=true;await restore();assert.equal(alarms.get('amazon-check').periodInMinutes,5);
await run(true);assert.equal(storage.lastRun.results.length,14);assert(storage.lastRun.results.every(r=>r.reason==='TAB_MISSING'));assert.equal(Object.keys(storage.history).length,14);assert.equal(notifications,0);assert.equal(storage.leaseUntil,undefined);
storage.leaseUntil=Date.now()+30000;assert((await run()).error);delete storage.leaseUntil;
storage.enabled=false;await restore();assert.equal(alarms.size,0);
assert.equal(new Set(ITEMS.map(i=>i.asin)).size,14);
for(const item of ITEMS)assert(new RegExp(item.titlePattern,'i').test(item.name),`Title fixture mismatch: ${item.name}`);
const tinPattern=new RegExp(ITEMS.find(i=>i.asin==='B0H784PJ49').titlePattern,'i');
assert(tinPattern.test('Pokémon TCG: 30TH Celebration Tin - Sylveon EX O Greninja EX (SE ENVÍA Aleatorio)'));
assert(!tinPattern.test('Pokémon TCG: 30TH Celebration Sylveon EX Box'));
let active=0,peak=0,reloads=0;const listeners=new Set();
// Runtime tests mock page completion, so skip only the DOM settling delay.
const originalSetTimeout=globalThis.setTimeout;
globalThis.setTimeout=(fn,ms,...args)=>originalSetTimeout(fn,ms===2500?0:ms,...args);
chrome.tabs.query=async()=>ITEMS.map((item,index)=>({id:index+1,url:item.url}));
chrome.tabs.get=async id=>({id,url:ITEMS[id-1].url});
chrome.tabs.onUpdated={addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};
chrome.tabs.reload=async id=>{active++;peak=Math.max(peak,active);reloads++;queueMicrotask(()=>{for(const fn of [...listeners])fn(id,{status:'complete'});});};
chrome.scripting={executeScript:async({args:[item]})=>{active--;return [{result:{asin:item.asin,url:item.url,state:'available',reason:'VERIFIED_FEATURED_OFFER',priceMxn:589,seller:'Amazon México'}}];}};
const pending=run();assert((await run()).error);await pending;
assert.equal(peak,2);assert.equal(reloads,14);assert.equal(notifications,14);assert.equal(storage.lastRun.results.length,14);
await run();assert.equal(notifications,14,'Unchanged available offers must not notify again');
let signal=true;
chrome.scripting.executeScript=async({args:[item]})=>{active--;return [{result:{asin:item.asin,url:item.url,title:item.name,state:signal===true?'buying_options_shown':signal===null?'blocked':'unknown',reason:signal===true?'BUYING_OPTIONS_CONTROL_VISIBLE':'OFFER_UNCONFIRMED',buyingOptionsShown:signal}}];};
await run();assert.equal(notifications,28,'First visible options signal should notify');
await run();assert.equal(notifications,28,'Repeated signal must not notify');
signal=null;await run();signal=true;await run();assert.equal(notifications,28,'Blocked checks must not reset signal deduplication');
signal=false;await run();signal=true;await run();assert.equal(notifications,42,'Visible again after a confirmed absence should notify');
assert.equal(storage.history[ITEMS[0].asin].lastVerified.state,'available','Signals cannot replace verified history');
globalThis.setTimeout=originalSetTimeout;
assert.equal(listeners.size,0);assert.equal(storage.leaseUntil,undefined);
console.log('14-product sweeps passed: maximum two concurrent tabs, overlap prevention, per-product history, first-availability notifications and duplicate suppression.');
console.log(`${cases} real-Edge DOM fixture cases passed; URL identity, history preservation, opt-in scheduling, missing tabs and lease checks passed. No live network requests.`);

assert.equal(storage.activeRun,undefined);
assert(storage.diagnostics.some(e=>e.type==='RUN_COMPLETED'&&e.count===14));
assert(storage.diagnostics.some(e=>e.type==='RELOAD_COMPLETED'));
assert(storage.diagnostics.some(e=>e.type==='RESULT'));
assert(storage.diagnostics.length<=500);

// A never-settling injection must not block later products or the next sweep.
const late=[];
globalThis.setTimeout=(fn,ms,...args)=>originalSetTimeout(fn,ms===15000?5:ms===2500?0:ms,...args);
chrome.scripting.executeScript=async({args:[item]})=>{
  if(item.asin===ITEMS[2].asin||item.asin===ITEMS[3].asin)return new Promise(resolve=>late.push(()=>resolve([{result:{asin:item.asin,state:'available',reason:'VERIFIED_FEATURED_OFFER'}}])));
  return [{result:{asin:item.asin,url:item.url,state:'sold_out',reason:'EXPLICIT_PRODUCT_UNAVAILABLE'}}];
};
await run();
assert.equal(storage.lastRun.results.length,14);
assert.equal(storage.lastRun.results[2].state,'error');
assert.equal(storage.lastRun.results[3].state,'error');
assert.equal(storage.lastRun.results[13].state,'sold_out');
assert(storage.diagnostics.some(e=>e.type==='EXTRACTION_FAILED'&&e.error==='TIMEOUT'));
assert.equal(storage.leaseUntil,undefined);
assert.equal(storage.activeRun,undefined);
const saved=JSON.stringify(storage.history);late.forEach(resolve=>resolve());await new Promise(resolve=>originalSetTimeout(resolve,0));
assert.equal(JSON.stringify(storage.history),saved,'Late extraction must not overwrite history');
chrome.scripting.executeScript=async({args:[item]})=>[{result:{asin:item.asin,url:item.url,state:'sold_out',reason:'EXPLICIT_PRODUCT_UNAVAILABLE'}}];
storage.enabled=true;await run(true);assert.equal(storage.lastRun.results.length,14);assert(storage.lastRun.results.every(r=>r.state==='sold_out'));
globalThis.setTimeout=originalSetTimeout;
console.log('Hung ETB/Bundle regression passed: bounded failure, remaining products checked, late results ignored, next automatic sweep succeeds.');

const offerPayload=intakeRecord({...transportRecord,state:'available',priceMxn:329,seller:'Amazon México',fulfilledBy:'Amazon',purchaseEnabled:true});
assert.equal(offerPayload.priceMxn,329);assert.equal(offerPayload.seller,'Amazon México');assert.equal(offerPayload.purchaseEnabled,true);
assert.equal(intakeRecord({...transportRecord,state:'buying_options_shown',priceMxn:329,seller:'Amazon'}).priceMxn,undefined);
