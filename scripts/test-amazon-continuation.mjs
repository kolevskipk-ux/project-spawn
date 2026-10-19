import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readAmazon} from '../collector/amazon-server/extract.js';
const require=createRequire(resolve(process.argv[2],'package.json'));
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const temp=mkdtempSync(join(tmpdir(),'scout-continuation-'));
const item={asin:'B0H783FY5Z',url:'https://www.amazon.com.mx/dp/B0H783FY5Z',titlePattern:'30th.*booster.*bundle'};
const product='<span id="productTitle">30th Booster Bundle</span><input id="ASIN" value="B0H783FY5Z"><div id="desktop_buybox"><span id="availability">Temporalmente agotado</span></div>';
const gate=(extra='',attrs='',button='')=>`<form action="/errors/validateCaptcha" ${attrs}><p>Haz clic en el botón de abajo para continuar comprando</p>${extra}<button ${button}>Continuar a Compras</button></form>`;
let cases=0;
try{
 const context=await browser.newContext({offline:true});const page=await context.newPage();let fixture='';let submissions=0;let returnToProduct=false;
 await page.route('**/*',r=>{if(new URL(r.request().url()).pathname.includes('validateCaptcha')){submissions++;if(returnToProduct)return r.fulfill({contentType:'text/html',body:'<script>location.replace('+JSON.stringify(item.url)+')</script>'});}return r.fulfill({contentType:'text/html; charset=utf-8',body:fixture});});
 const read=step=>page.evaluate(({source,item,step})=>(0,eval)('('+source+')')(item,null,Date.now()+10000,step),{source:readAmazon.toString(),item,step});
 for(const [label,html,allowed] of [
  ['ordinary gate',gate(),true],
  ['CAPTCHA input',gate('<input id="captchacharacters">'),false],
  ['robot wording',gate('<p>Sorry, we need to make sure you are not a robot</p>'),false],
  ['character instructions',gate('<p>Introduce los caracteres</p>'),false],
  ['foreign form',gate().replace('/errors/validateCaptcha','https://example.org/errors/validateCaptcha'),false],
  ['wrong action',gate().replace('/errors/validateCaptcha','/other'),false],
  ['POST form',gate('','method="post"'),false],
  ['foreign button override',gate('','','formaction="https://example.org/errors/validateCaptcha"'),false],
  ['POST button override',gate('','','formmethod="post"'),false],
  ['disabled button',gate('','','disabled'),false],
  ['hidden button',gate('','','style="display:none"'),false],
  ['real product',product+gate(),false]
 ]){
  fixture=html;await page.goto(item.url);await page.evaluate(()=>{window.clicks=0;document.querySelector('form')?.addEventListener('submit',e=>{e.preventDefault();window.clicks++;});});
  const detected=await read('main');assert.equal(detected.gateType==='continue_shopping',allowed,label);
  await read('continue');assert.equal(await page.evaluate(()=>window.clicks),allowed?1:0,label);cases++;
 }
 // Exercise the real worker continuation path with intercepted navigation.
 for(const name of ['read-tab.js','extract.js'])copyFileSync(new URL('../collector/amazon-server/'+name,import.meta.url),join(temp,name));
 for(const name of ['deadline.js','diagnostics.js','page-trace.js'])copyFileSync(new URL('../collector/amazon-server/'+name,import.meta.url),join(temp,name));
 writeFileSync(join(temp,'package.json'),'\u007b"type":"module"\u007d');
 const state={};globalThis.browser={storage:{local:{get:async()=>state,set:async v=>Object.assign(state,v)}},scripting:{executeScript:async({func,args})=>[{result:await page.evaluate(({source,args})=>(0,eval)('('+source+')')(...args),{source:func.toString(),args})}]}};
 const {readTab}=await import(pathToFileURL(join(temp,'read-tab.js')));
 fixture=gate();await page.goto(item.url);fixture=product;submissions=0;returnToProduct=true;
 const recovered=await readTab(1,item,{deadlineAt:Date.now()+20000});
 assert.equal(recovered.state,'sold_out',JSON.stringify(recovered));assert.equal(submissions,1);cases++;
 fixture=gate();await page.goto(item.url);submissions=0;
 const loop=await readTab(1,item,{deadlineAt:Date.now()+20000});
 assert.equal(loop.state,'blocked');assert.equal(submissions,1,'persistent gate gets one attempt only');cases++;
 fixture=product.replace('value="B0H783FY5Z"','value="B000000000"');await page.goto(item.url);
 assert.equal((await read('main')).reason,'PRODUCT_IDENTITY_UNCONFIRMED');cases++;
 console.log(JSON.stringify({passed:cases,liveRetailerRequests:0,covered:'guard exclusions, one-click navigation and reread, persistent gate, identity rejection'}));
}finally{await browser.close();rmSync(temp,{recursive:true,force:true});}
