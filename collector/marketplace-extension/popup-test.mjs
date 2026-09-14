import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/Philip/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const mode of ['success','stalled']){
  const page=await browser.newPage();
  await page.route('**/*',async route=>{const name=new URL(route.request().url()).pathname.slice(1);if(!['popup.html','popup.js','mercadolibre-items.js'].includes(name))return route.abort();await route.fulfill({contentType:name.endsWith('.js')?'application/javascript':'text/html',body:await readFile(new URL(name,import.meta.url),'utf8')});});
  await page.addInitScript(mode=>{window.chrome={runtime:{sendMessage:()=>mode==='stalled'?new Promise(()=>{}):Promise.resolve({enabled:false,nextAt:null})}};},mode);
  await page.goto('https://fixture.invalid/popup.html');
  await page.locator('#links a').first().waitFor();
  assert.equal(await page.locator('#links a').count(),5);
  assert.match(await page.locator('#notice').innerText(),/MERCADOLIBRE HOME_MX/);
  if(mode==='stalled'){await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('did not respond'));}
  else {await page.waitForFunction(()=>document.querySelector('#schedule').textContent.includes('OFF'));}
  await page.close();
 }
 console.log('Popup renders five links before worker response; normal status and stalled-worker recovery passed.');
}finally{await browser.close();}
