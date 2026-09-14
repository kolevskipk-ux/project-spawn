import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {MERCADOLIBRE_ITEMS,exactMercadoLibreItem} from './mercadolibre-items.js';
import {readMercadoLibreOffer} from './mercadolibre-extract.js';
import {appendObservation} from './history.js';
const item=MERCADOLIBRE_ITEMS[2];
assert(exactMercadoLibreItem(item.url,item));
assert(exactMercadoLibreItem(item.catalogUrl,item));
assert(exactMercadoLibreItem(MERCADOLIBRE_ITEMS[4].catalogUrl,MERCADOLIBRE_ITEMS[4]));
assert(!exactMercadoLibreItem(MERCADOLIBRE_ITEMS[4].catalogUrl,item));
assert(!exactMercadoLibreItem(item.catalogUrl.replace('www.mercadolibre.com.mx','evil.example'),item));
assert(!exactMercadoLibreItem('https://www.mercadolibre.com.mx/product/p/MLM75656784',item));
assert(!exactMercadoLibreItem(item.url.replace('5984323768','5984323769'),item));
assert(MERCADOLIBRE_ITEMS.every(i=>i.expectedSellerId===null));
let history=appendObservation({},'mercadolibre',{itemId:item.itemId,state:'available',id:'verified'});
for(let i=0;i<60;i++)history=appendObservation(history,'mercadolibre',{itemId:item.itemId,state:'unknown',id:String(i)});
assert.equal(history[`mercadolibre:${item.itemId}`].lastVerified.id,'verified');
assert.equal(history[`mercadolibre:${item.itemId}`].checks.length,48);

const require=createRequire('C:/Users/Philip/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();let fixture='';
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
 const title='<h1 class="ui-pdp-title">Pokemon 30th Celebration Booster Bundle 6 sobres</h1>';
 const offer=`<div class="ui-pdp-buybox"><input name="item_id" value="${item.itemId}"><input name="seller_id" value="12345"><span class="ui-pdp-seller__name">MERCADOLIBRE HOME_MX</span><div class="ui-pdp-price__second-line"><span class="andes-money-amount__currency-symbol">$</span><span class="andes-money-amount__fraction">1,100</span></div><div class="ui-pdp-shipping">Envío a 53100</div><div class="ui-pdp-stock-information">Disponible</div><div class="ui-pdp-actions"><button>Comprar ahora</button></div></div>`;
 async function check(html,policy={...item,expectedSellerId:'12345'},url=item.url){fixture=html;await page.goto('about:blank');await page.goto(url);return page.evaluate(readMercadoLibreOffer,policy);}
 let r=await check(title+offer);assert.equal(r.state,'available');assert.equal(r.priceMxn,1100);
 r=await check(title+offer,item);assert.equal(r.state,'unknown');assert.equal(r.reason,'SELLER_REVIEW_REQUIRED');assert.equal(r.sellerId,'12345');
 r=await check(title+offer.replace('value="12345"','value="99999"'));assert.equal(r.reason,'SELLER_MISMATCH');
 r=await check(title+offer.replace('53100','11220'));assert.equal(r.state,'unknown');
 r=await check(title+offer.replace('<button>','<button disabled>'));assert.equal(r.state,'unknown');
 r=await check(title+offer.replace('Disponible','Agotado'));assert.equal(r.reason,'CONTRADICTORY_OFFER');
 r=await check(title+offer.replace('Disponible','Agotado').replace('<button>','<button disabled>'));assert.equal(r.state,'sold_out');
 r=await check(title+offer.replace('Envío a 53100','No podemos enviar a 53100'));assert.equal(r.reason,'DELIVERY_UNAVAILABLE');
 r=await check(title+offer.replace(item.itemId,'MLM5984323769'));assert.equal(r.reason,'OFFER_ID_UNCONFIRMED');
 r=await check(title+offer,item,'https://www.mercadolibre.com.mx/product/p/MLM75656784');assert.equal(r.reason,'ITEM_REDIRECTED_OR_CHANGED');
 r=await check('<p>Para continuar, ingresa a tu cuenta</p>',item,'https://www.mercadolibre.com.mx/gz/account-verification');assert.equal(r.state,'blocked');
 r=await check(title+offer.replace('Disponible','Agotado').replace('<button>','<button disabled>')+'<div class="ui-pdp-recommendations"><button>Comprar ahora</button></div>');assert.equal(r.state,'sold_out');
 r=await check(title+offer,{...item,expectedSellerId:'12345'},item.catalogUrl);assert.equal(r.state,'available');
 r=await check(title+offer,item,item.catalogUrl);assert.equal(r.reason,'SELLER_REVIEW_REQUIRED');
 r=await check(title+offer.replace(item.itemId,'MLM9999999999'),{...item,expectedSellerId:'12345'},item.catalogUrl);assert.equal(r.reason,'OFFER_ID_UNCONFIRMED');
 r=await check(title+offer.replace(`name="item_id" value="${item.itemId}"`,'name="unrelated" value="0"'),{...item,expectedSellerId:'12345'},item.catalogUrl);assert.equal(r.reason,'OFFER_ID_UNCONFIRMED');
 const etb=MERCADOLIBRE_ITEMS[4];r=await check(title.replace('Booster Bundle 6 sobres','Elite Trainer Box')+offer.replace(item.itemId,etb.itemId),{...etb,expectedSellerId:'12345'},etb.catalogUrl);assert.equal(r.state,'available');
 const unavailable=`<main><section>${title}<div><b>Producto agotado</b><p>Recibirás una notificación cuando esté disponible.</p></div></section></main>`;
 r=await check(unavailable,item,item.catalogUrl);assert.equal(r.pageAvailability,'sold_out');assert.equal(r.state,'unknown');assert.equal(r.sellerId,null);
 r=await check(unavailable.replace('<div>','<div style="display:none">'),item,item.catalogUrl);assert.equal(r.pageAvailability,undefined);
 r=await check(unavailable.replace('<div>','<div class="ui-pdp-recommendations">'),item,item.catalogUrl);assert.equal(r.pageAvailability,undefined);
 r=await check(unavailable.replace('</section>','<button>Comprar ahora</button></section>'),item,item.catalogUrl);assert.equal(r.pageAvailability,undefined);
 console.log('21 browser extraction cases and identity/history checks passed. All browser network requests intercepted.');
}finally{await browser.close();}

// Exercise the actual worker with a minimal Chrome API mock, including token isolation.
const storage={},alarms=new Map();let result={itemId:item.itemId,state:'unknown',reason:'SELLER_REVIEW_REQUIRED',sellerId:'12345'},fetches=0;
globalThis.fetch=async()=>{fetches++;throw new Error('Unexpected remote request');};
globalThis.chrome={
 storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,storage[key]])),set:async values=>Object.assign(storage,values),remove:async key=>delete storage[key]}},
 alarms:{get:async name=>alarms.get(name),create:async(name,value)=>alarms.set(name,value),clear:async name=>alarms.delete(name),onAlarm:{addListener(){}}},
 tabs:{query:async()=>[{id:1,url:item.url}],get:async()=>({id:1,url:item.url})},
 scripting:{executeScript:async()=>[{result}]},action:{setBadgeText:async()=>{}},
 runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(){}}}
};
const {run,restoreAlarms}=await import('./background.js');
await restoreAlarms();assert.equal(alarms.size,0);
storage.mercadolibreEnabled=true;await restoreAlarms();assert(alarms.has('mercadolibre-warm'));assert(!alarms.has('walmart-warm'));
storage.walmartEnabled=true;storage.mercadolibreEnabled=false;await restoreAlarms();assert(!alarms.has('mercadolibre-warm'));assert(alarms.has('walmart-warm'));
assert.deepEqual(await run('mercadolibre',true),{skipped:true});
const preview=await run('mercadolibre');assert.equal(preview.results[0].local,true);assert.equal(fetches,0);assert.equal(storage.leaseUntil,undefined);
storage.leaseUntil=Date.now()+10000;assert((await run('mercadolibre')).error);assert(storage.leaseUntil);delete storage.leaseUntil;
console.log('Independent alarms, disabled automatic checks, local-only intake and lease handling passed.');
