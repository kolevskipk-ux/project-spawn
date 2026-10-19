import assert from 'node:assert/strict';
import {mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readHealth} from '../collector/amazon-extension/read-health.js';
let cases=0;
for(const results of [
 [{state:'unknown',reason:'TAB_MISSING'}],
 [{state:'unknown',reason:'PRODUCT_IDENTITY_UNCONFIRMED'},{state:'sold_out'},{state:'sold_out'}],
 [{state:'error',reason:'PRODUCT_TIMEOUT'}],
 Array.from({length:6},()=>({state:'error',reason:'PAGE_CHECK_FAILED'}))
]){const h=readHealth(results);assert.ok(h.errors>0);assert.equal(h.stopReason,null);cases++;}
for(const reason of ['CHALLENGE_OR_SIGN_IN','CONTINUE_SHOPPING_REQUIRED','REDIRECTED_OR_CHALLENGED']){
 const h=readHealth([{state:'sold_out'},{state:'blocked',reason},{state:'error'}]);
 assert.equal(h.stopReason,'CHALLENGE');assert.equal(h.challenges,1);cases++;
}
assert.equal(readHealth([{state:'unknown',reason:'OTHER_SELLER_FEATURED'}]).errors,0);cases++;
const temp=mkdtempSync(join(tmpdir(),'scout-isolation-'));
try{
 writeFileSync(join(temp,'package.json'),'{"type":"module"}');
 copyFileSync(new URL('../collector/amazon-server/product-tab.js',import.meta.url),join(temp,'product-tab.js'));
 writeFileSync(join(temp,'items.js'),`export function exact(url,item){try{return new URL(url).origin==='https://www.amazon.com.mx'&&new URL(url).pathname==='/dp/'+item.asin}catch{return false}}`);
 const {productTab}=await import(pathToFileURL(join(temp,'product-tab.js')));
 const item={asin:'B0H78BB9TY',url:'https://www.amazon.com.mx/dp/B0H78BB9TY'};
 let tabs=[],store={},creates=0;
 globalThis.browser={tabs:{query:async()=>tabs.filter(t=>t.url.startsWith('https://www.amazon.com.mx/')),get:async id=>{const t=tabs.find(t=>t.id===id);if(!t)throw Error('closed');return t;},create:async o=>{creates++;const t={id:creates+10,url:o.url};tabs.push(t);return t;}},storage:{local:{get:async()=>store,set:async v=>Object.assign(store,v)}}};
 assert.equal((await productTab(item)).id,11);assert.equal(creates,1);cases++;
 assert.equal((await productTab(item)).id,11);assert.equal(creates,1);cases++;
 tabs[0].url='https://www.amazon.com.mx/errors/validateCaptcha';
 assert.equal((await productTab(item)).id,11,'mapped gate goes through guarded reader');assert.equal(creates,1);cases++;
 tabs=[];assert.equal((await productTab(item)).id,12,'closed tab replaced');cases++;
 tabs[0].url='https://example.com/redirect';assert.equal(await productTab(item),null);assert.equal(creates,2);cases++;
 store={};tabs=[{id:20,url:'https://www.amazon.com.mx/errors/validateCaptcha'}];
 assert.equal(await productTab(item),null,'unassigned challenge is not bypassed');assert.equal(creates,2);cases++;
 tabs=[{id:20,url:'https://www.amazon.com.mx/ap/signin'}];assert.equal(await productTab(item),null);cases++;
 await assert.rejects(productTab({...item,url:'https://example.com/dp/'+item.asin}));cases++;
 console.log(JSON.stringify({passed:cases,network:'mocked',challengeStops:'preserved'}));
}finally{delete globalThis.browser;rmSync(temp,{recursive:true,force:true});}
