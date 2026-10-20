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
const temp=mkdtempSync(join(tmpdir(),'scout-homepage-'));
const item={asin:'B0H77XNKKK',url:'https://www.amazon.com.mx/dp/B0H77XNKKK',titlePattern:'30th.*ultra.?premium.*night'};
const home='<title>Amazon.com.mx: Precios bajos</title><input id="twotabsearchtextbox"><p>Amazon México</p>';
const product='<span id="productTitle">30th Ultra-Premium Collection Night</span><input id="ASIN" value="B0H77XNKKK"><div id="desktop_buybox"><span id="availability">Temporalmente agotado</span></div>';
let cases=0;
try{
 const context=await browser.newContext({offline:true}),page=await context.newPage();let fixture=home;
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture}));
 const read=()=>page.evaluate(({source,item})=>(0,eval)('('+source+')')(item,null,Date.now()+10000,'main'),{source:readAmazon.toString(),item});
 for(const [label,url,html,allowed,blocked]of[
  ['recognized homepage','https://www.amazon.com.mx/',home,true,false],
  ['captcha input','https://www.amazon.com.mx/',home+'<input id="captchacharacters">',false,true],
  ['robot wording','https://www.amazon.com.mx/',home+'<p>Sorry, we need to make sure you are not a robot</p>',false,true],
  ['character instructions','https://www.amazon.com.mx/',home+'<p>Introduce los caracteres</p>',false,true],
  ['sign-in','https://www.amazon.com.mx/ap/signin',home,false,true],
  ['foreign host','https://example.com/',home,false,false],
  ['unknown root','https://www.amazon.com.mx/','<p>No product</p>',false,false],
  ['wrong path','https://www.amazon.com.mx/gp/help',home,false,false],
  ['product at root','https://www.amazon.com.mx/',home+product,false,false],
  ['real product',item.url,product,false,false]
 ]){fixture=html;await page.goto(url);const result=await read();assert.equal(!!result.homepageRecoveryAllowed,allowed,label);assert.equal(result.state==='blocked',blocked,label);cases++;}
 for(const name of ['extract.js','read-tab.js','deadline.js','diagnostics.js','page-trace.js'])copyFileSync(new URL('../collector/amazon-server/'+name,import.meta.url),join(temp,name));
 writeFileSync(join(temp,'package.json'),'{"type":"module"}');
 const state={},listeners=new Set();let navigations=0,after=product;
 globalThis.browser={storage:{local:{get:async()=>state,set:async v=>Object.assign(state,v)}},tabs:{onUpdated:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},update:async(id,options)=>{assert.equal(options.url,item.url);navigations++;fixture=after;await page.goto(after===home?'https://www.amazon.com.mx/':options.url);for(const fn of [...listeners])fn(id,{status:'complete'});return {id,url:options.url};}},scripting:{executeScript:async({func,args})=>[{result:await page.evaluate(({source,args})=>(0,eval)('('+source+')')(...args),{source:func.toString(),args})}]}};
 const {readTab}=await import(pathToFileURL(join(temp,'read-tab.js')));
 fixture=home;await page.goto('https://www.amazon.com.mx/');
 const recovered=await readTab(1,item,{deadlineAt:Date.now()+20000});assert.equal(recovered.state,'sold_out');assert.equal(navigations,1);assert.equal(listeners.size,0);cases++;
 fixture=home;await page.goto('https://www.amazon.com.mx/');after=home;navigations=0;
 const persistent=await readTab(1,item,{deadlineAt:Date.now()+20000});assert.equal(persistent.state,'unknown');assert.equal(navigations,1);assert.equal(persistent.homepageRecoveryAttempted,true);cases++;
 fixture=home+'<input id="captchacharacters">';await page.goto('https://www.amazon.com.mx/');navigations=0;
 assert.equal((await readTab(1,item,{deadlineAt:Date.now()+20000})).state,'blocked');assert.equal(navigations,0);cases++;
 fixture=home;await page.goto('https://www.amazon.com.mx/');after='<input id="captchacharacters">';navigations=0;
 assert.equal((await readTab(1,item,{deadlineAt:Date.now()+20000})).state,'blocked');assert.equal(navigations,1);cases++;
 fixture=home;await page.goto('https://www.amazon.com.mx/');after=product.replace('value="B0H77XNKKK"','value="B000000000"');
 assert.equal((await readTab(1,item,{deadlineAt:Date.now()+20000})).reason,'PRODUCT_IDENTITY_UNCONFIRMED');cases++;
 console.log(JSON.stringify({passed:cases,liveRetailerRequests:0,covered:'positive homepage recognition, one canonical navigation, persistent redirect bound, pre/post challenge and identity guards'}));
}finally{delete globalThis.browser;await browser.close();rmSync(temp,{recursive:true,force:true});}

