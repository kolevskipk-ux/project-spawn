import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const configPath=process.argv[2];
if(!configPath)throw new Error('Pass the private collector configuration path');
const config=JSON.parse(await readFile(configPath,'utf8'));
const require=createRequire(path.join(config.nodeModules,'package.json'));
const {chromium}=require('playwright');
await mkdir(config.dataDir,{recursive:true});
const lockPath=path.join(config.dataDir,'run.lock');
let lock;
try{lock=await open(lockPath,'wx');}catch{console.log('Collector already running; remove a stale run.lock only after confirming no collector process remains.');process.exit(0);}
let context;
try{
 if(!process.argv.includes('--test')){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').map(Number);
 const minutes=parts[0]*60+parts[1];if(minutes>=125&&minutes<365)process.exitCode=0;
 if(minutes>=125&&minutes<365)throw new Error('QUIET_WINDOW');
 }
 context=await chromium.launchPersistentContext(path.join(config.dataDir,'browser-profile'),{channel:'msedge',headless:!process.argv.includes('--setup'),viewport:{width:1280,height:900}});
 if(process.argv.includes('--setup')){
  const page=context.pages()[0]||await context.newPage();await page.goto(config.items[0].url,{waitUntil:'domcontentloaded'});
  console.log('Dedicated collector browser is open. Configure postcode 53100 and resolve identity challenges manually if presented. Close the browser when finished.');
  await new Promise(resolve=>context.on('close',resolve));
 }else{
 const results=[];
 for(const item of config.items){
  const page=await context.newPage();let observation;
  try{
   await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:20000});
   await page.locator('#main-title').waitFor({state:'visible',timeout:8000}).catch(()=>{});
   await page.waitForTimeout(1500);
   observation=await page.evaluate(()=>{
    const title=document.querySelector('#main-title')?.textContent?.trim()||'';
    const body=document.body.innerText;
    if(/Verifica tu identidad|confirma.*no eres un robot|Robot or human/i.test(body))return {title:'',offerText:'Identity challenge',state:'blocked',priceMxn:null,seller:null,postcode:null,purchaseEnabled:false};
    const candidates=[...document.querySelectorAll('div,section,aside')].filter(el=>el.getClientRects().length&&el.innerText.length<2000&&/Vendido y enviado por\s+Walmart/i.test(el.innerText)&&/Precio actual/i.test(el.innerText));
    const root=candidates.sort((a,b)=>a.innerText.length-b.innerText.length)[0];
    const text=root?.innerText||'';
    const price=text.match(/Precio actual\s*\$\s*([\d,]+(?:\.\d{2})?)/i);
    const priceMxn=price?Number(price[1].replaceAll(',','')):null;
    const purchaseEnabled=Boolean(root&&[...root.querySelectorAll('button')].some(b=>b.getClientRects().length&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&/agregar al carrito|comprar ahora/i.test(b.innerText+' '+b.getAttribute('aria-label'))));
    const postcode=/53100/.test(text)?'53100':null;
    const seller=/Vendido y enviado por\s+Walmart/i.test(text)?'Walmart':null;
    const state=!title||!postcode||!seller?'unknown':/\bAgotado\b/i.test(text)?'sold_out':purchaseEnabled&&priceMxn&&!/envío no disponible/i.test(text)?'available':'unknown';
    return {title,offerText:text.slice(0,1500),state,priceMxn,seller,postcode,purchaseEnabled};
   });
  }catch(error){observation={title:'',offerText:String(error.message).split('\n')[0].slice(0,250),state:'error',priceMxn:null,seller:null,postcode:null,purchaseEnabled:false};}
  const record={...observation,id:crypto.randomUUID(),itemId:item.itemId,url:item.url,observedAt:new Date().toISOString()};
  results.push(record);
  await page.close();
  if(config.endpoint&&!process.argv.includes('--test')){
   const response=await fetch(config.endpoint+'/observe',{method:'POST',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${process.env.WALMART_COLLECTOR_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(record)});
   record.intakeStatus=response.status;if(!response.ok)record.intakeError=(await response.text()).slice(0,250);
  }
 }
 await writeFile(path.join(config.dataDir,'latest.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));
 console.log(JSON.stringify(results.map(({itemId,state,priceMxn,intakeStatus})=>({itemId,state,priceMxn,intakeStatus}))));
 }
}catch(error){if(error.message!=='QUIET_WINDOW'){console.error(error.message);process.exitCode=1;}}
finally{await context?.close().catch(()=>{});await lock.close();await unlink(lockPath).catch(()=>{});}

