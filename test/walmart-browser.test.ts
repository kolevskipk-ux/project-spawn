import {describe,it,expect} from 'vitest';
import {validateWalmartObservation,handleWalmartBrowser} from '../src/walmart-browser';
const base={id:'00000000-0000-0000-0000-000000000001',itemId:'00019621415869',observedAt:new Date().toISOString(),url:'https://www.walmart.com.mx/ip/upc/00019621415869',title:'Pokemon 30th Ultra Premium Day o Night',offerText:'Agotado',state:'sold_out',postcode:'53100',priceMxn:3370,seller:'Walmart',purchaseEnabled:false};
describe('Walmart collector boundary',()=>{
 it('accepts exact attributed sold-out observations',()=>expect(validateWalmartObservation(base)?.good).toBe(true));
 it('rejects stale, wrong identity, wrong destination and unrelated offers',()=>{
  for(const patch of [{observedAt:'2020-01-01'},{itemId:'other'},{postcode:'11220'},{title:'Sponsored toy'},{url:'https://evil.test/ip/00019621415869'},{state:'sold_out',offerText:'Envío no disponible'}])expect(validateWalmartObservation({...base,...patch})).toBeNull();
 });
 it('requires enabled purchase evidence and rejects unavailable delivery',()=>{
  expect(validateWalmartObservation({...base,state:'available'})).toBeNull();
  expect(validateWalmartObservation({...base,state:'available',offerText:'Disponible',purchaseEnabled:true})?.good).toBe(true);
  expect(validateWalmartObservation({...base,state:'available',offerText:'Envío no disponible',purchaseEnabled:true})).toBeNull();
 });
 it('keeps blocked observations unverified',()=>expect(validateWalmartObservation({...base,state:'blocked',title:'',postcode:null,seller:null,priceMxn:null,offerText:'Identity challenge'})?.good).toBe(false));
 it('rejects unauthenticated intake before database access',async()=>expect((await handleWalmartBrowser(new Request('https://spawn.test/internal/walmart-browser/observe',{method:'POST'}),{} as any))?.status).toBe(401));
});

import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
it('persists blocked checks without erasing stock, rejects stale overwrites and deduplicates receipts',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('migrations/0040_walmart_browser_observations.sql','utf8'));
 db.exec(`CREATE TABLE inventory(retailer_sku TEXT,canonical_url TEXT,status TEXT,availability_state TEXT,price_mxn REAL,seller TEXT,last_seen_at TEXT,availability_observed_at TEXT,pricing_observed_at TEXT,availability_freshness_status TEXT,price_verification_status TEXT); INSERT INTO inventory(retailer_sku,canonical_url,status) VALUES('00019621415869','https://www.walmart.com.mx/ip/upc/00019621415869','unknown');`);
 const prepare=(sql:string)=>{let args:any[]=[];return {bind(...v:any[]){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async run(){return db.prepare(sql).run(...args);}};};
 const env={WALMART_COLLECTOR_TOKEN:'test-token',SPAWN_DB:{prepare,batch:async(q:any[])=>{db.exec('BEGIN');try{for(const s of q)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}}} as any;
 const send=(body:any)=>handleWalmartBrowser(new Request('https://spawn.test/internal/walmart-browser/observe',{method:'POST',headers:{authorization:'Bearer test-token'},body:JSON.stringify(body)}),env);
 const fresh={...base,observedAt:new Date().toISOString()};
 expect((await send(fresh))?.status).toBe(200);expect((await send(fresh))?.status).toBe(200);
 await send({...fresh,id:'00000000-0000-0000-0000-000000000002',state:'blocked',offerText:'Identity challenge'});
 expect(db.prepare('SELECT status FROM inventory').get()?.status).toBe('sold_out');
 await send({...fresh,id:'00000000-0000-0000-0000-000000000003',observedAt:new Date(Date.now()-60000).toISOString(),state:'available',offerText:'Disponible',purchaseEnabled:true});
 expect(db.prepare('SELECT status FROM inventory').get()?.status).toBe('sold_out');
 expect(db.prepare('SELECT COUNT(*) n FROM walmart_browser_observations').get()?.n).toBe(3);
 db.close();
});
