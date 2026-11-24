import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,copyFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const root=mkdtempSync(join(tmpdir(),'scout-catalog-test-'));
writeFileSync(join(root,'package.json'),'{"type":"module"}');writeFileSync(join(root,'private-config.js'),"export const AMAZON_COLLECTOR_TOKEN='fixture';");
const base=Array.from({length:16},(_,n)=>({asin:'B0BASE'+String(n).padStart(4,'0'),url:'https://www.amazon.com.mx/dp/B0BASE'+String(n).padStart(4,'0'),name:'Base '+n,titlePattern:'30th.*booster'}));
writeFileSync(join(root,'base-items.js'),'export const ITEMS='+JSON.stringify(base)+';');copyFileSync(new URL('../collector/amazon-server/catalog-sync.js',import.meta.url),join(root,'catalog-sync.js'));
const originalNow=Date.now,originalFetch=globalThis.fetch,originalBrowser=globalThis.browser;
let now=Date.now(),calls=0;Date.now=()=>now;const storage={enabled:false,manualPaused:true,history:{retained:true}};
globalThis.browser={storage:{local:{async get(){return storage;},async set(v){Object.assign(storage,v);}}}};
const items=base.map(i=>({...i,category:'30th_celebration',routingKey:'pokemon-30th'}));for(let n=0;n<3;n++)items.push({asin:'B0EXTRA00'+n,url:'https://www.amazon.com.mx/dp/B0EXTRA00'+n,name:'Delta Reign Build Battle',titlePattern:'delta.*build.*battle',category:'delta_reign',routingKey:'delta-reign'});
const catalog=()=>({schemaVersion:1,maxTargets:20,version:'a'.repeat(64),generatedAt:new Date(now).toISOString(),expiresAt:new Date(now+1800000).toISOString(),items});
try{
 const m=await import(pathToFileURL(join(root,'catalog-sync.js')));
 assert.equal(m.validCatalog(catalog()),true);
 const flowing={asin:'B0HS8RG5C9',url:'https://www.amazon.com.mx/dp/B0HS8RG5C9',name:'Flowing Fists Elite Trainer Box',titlePattern:'flowing fists.*elite trainer box',category:'flowing_fists',routingKey:'flowing-fists'};
 const expanded={...catalog(),schemaVersion:2,maxTargets:28,items:[...items,flowing]};
 assert.equal(m.validCatalog(expanded),true);
 assert.equal(m.validCatalog({...catalog(),items:expanded.items}),false);

 assert.equal(m.validCatalog({...catalog(),items:[...items,...items]}),false);
 assert.equal(m.validCatalog({...catalog(),items:[{...items[0],url:'https://evil.test'}]}),false);
 assert.equal(m.validCatalog({...catalog(),expiresAt:new Date(now-1).toISOString()}),false);
 assert.equal(m.validCatalog({...catalog(),items:[{...items[0],titlePattern:'anything'}]}),false);
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'https://spawn.aztlan-eng.com/internal/amazon-browser/targets?schema=2');assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,'Bearer fixture');await new Promise(r=>setTimeout(r,10));return Response.json(expanded);};
 assert.deepEqual(await Promise.all([m.ensureCatalog(),m.ensureCatalog()]),[true,true]);assert.equal(calls,1);assert.equal(m.ITEMS.length,20);
 assert.equal(storage.enabled,false);assert.equal(storage.manualPaused,true);assert.deepEqual(storage.history,{retained:true});
 now+=300001;globalThis.fetch=async()=>{throw Error('offline');};assert.equal(await m.ensureCatalog(),true);assert.equal(m.ITEMS.length,20);
 now+=1800001;assert.equal(await m.ensureCatalog(),false);assert.equal(storage.manualPaused,true);
 now+=300001;globalThis.fetch=async()=>Response.json({...catalog(),items:items.slice(0,18)});assert.equal(await m.ensureCatalog(),true);assert.equal(m.ITEMS.length,18);
 console.log('Catalog identity/cap/TTL/withdrawal/concurrency and pause preservation passed');
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;globalThis.browser=originalBrowser;}
