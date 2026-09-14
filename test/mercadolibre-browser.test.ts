import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {validateMercadoLibreObservation,handleMercadoLibreBrowser} from '../src/mercadolibre-browser';
import {sendMercadoLibreObservation} from '../collector/marketplace-extension/mercadolibre-transport.js';
const observation=()=>({id:'00000000-0000-0000-0000-000000000001',itemId:'MLM5984323768',url:'https://www.mercadolibre.com.mx/product/p/MLM75624347?fbclid=discard#tracking_id=discard',title:'Pokemon TCG 30th Celebration Booster Bundle 6pk en Ingles',observedAt:new Date().toISOString(),state:'unknown',reason:'PAGE_SOLD_OUT_SELLER_UNCONFIRMED',pageAvailability:'sold_out',priceMxn:null,seller:null,sellerId:null,postcode:null,purchaseEnabled:false,visibleItemId:null});
describe('Mercado Libre collector',()=>{
 it('retains sold-out page evidence without promoting unknown to verified',()=>{
  const result=validateMercadoLibreObservation({...observation(),accountEmail:'must not persist'});
  expect(result?.state).toBe('unknown');expect(result?.pageAvailability).toBe('sold_out');
  expect(result?.url).toBe('https://articulo.mercadolibre.com.mx/MLM-5984323768-_JM');
  expect(result).not.toHaveProperty('accountEmail');
 });
 it('rejects wrong identity, stale checks, contradictory page evidence and client seller approval',()=>{
  for(const patch of [{itemId:'MLM1234567890'},{url:'https://evil.test/p/MLM75624347'},{url:'https://www.mercadolibre.com.mx/product/p/MLM75656814'},{observedAt:'2020-01-01'},{observedAt:new Date(Date.now()+120000).toISOString()},{purchaseEnabled:true},{title:'Other product'},{sellerId:123},{priceMxn:-1},{reason:'arbitrary text'},{state:'sold_out'},{state:'available',expectedSellerId:'123',sellerId:'123',seller:'MERCADOLIBRE HOME_MX',postcode:'53100',visibleItemId:'MLM5984323768',purchaseEnabled:true,priceMxn:500,pageAvailability:null,reason:'VERIFIED_PURCHASE_CONTROL'}])expect(validateMercadoLibreObservation({...observation(),...patch})).toBeNull();
 });
 it('accepts bounded missing-tab diagnostics',()=>{
  expect(validateMercadoLibreObservation({...observation(),title:'',pageAvailability:undefined,reason:'TAB_MISSING'})?.state).toBe('unknown');
 });
 it('requires a separate scoped credential before database access',async()=>{
  for(const env of [{},{MERCADOLIBRE_COLLECTOR_TOKEN:'ml',WALMART_COLLECTOR_TOKEN:'walmart'},{MERCADOLIBRE_COLLECTOR_TOKEN:'walmart',WALMART_COLLECTOR_TOKEN:'walmart'}]){
   const r=await handleMercadoLibreBrowser(new Request('https://spawn.test/internal/mercadolibre-browser/observe',{method:'POST',headers:{authorization:'Bearer walmart'}}),env as any);expect(r?.status).toBe(401);
  }
 });
 it('stores receipts idempotently, rejects changed duplicates, and orders by observation time',async()=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync('migrations/0042_mercadolibre_browser_observations.sql','utf8'));
  // No inventory table exists: the observer must never write customer inventory.
  const prepare=(sql:string)=>{let args:any[]=[];return {bind(...v:any[]){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async run(){return db.prepare(sql).run(...args);}};};
  const env={MERCADOLIBRE_COLLECTOR_TOKEN:'ml',SPAWN_DB:{prepare}} as any;
  const send=(body:any)=>handleMercadoLibreBrowser(new Request('https://spawn.test/internal/mercadolibre-browser/observe',{method:'POST',headers:{authorization:'Bearer ml'},body:JSON.stringify(body)}),env);
  try{
   const base=observation();expect((await send(base))?.status).toBe(200);expect((await send(base))?.status).toBe(200);
   expect((await send({...base,priceMxn:500}))?.status).toBe(409);
   expect((await send({...base,id:'00000000-0000-0000-0000-000000000002',observedAt:new Date(Date.now()-60000).toISOString(),state:'blocked',pageAvailability:null,reason:'ACCOUNT_VERIFICATION'}))?.status).toBe(200);
   expect(db.prepare('SELECT COUNT(*) AS n FROM mercadolibre_browser_observations').get()?.n).toBe(2);
   const response=await handleMercadoLibreBrowser(new Request('https://spawn.test/internal/mercadolibre-browser/status',{headers:{authorization:'Bearer ml'}}),env);
   const body=await response!.json() as any;const row=body.rows.find((r:any)=>r.itemId===base.itemId);
   expect(row.latest.id).toBe(base.id);expect(row.lastVerified).toBeNull();expect(body.customerAlertsEnabled).toBe(false);
   expect(response?.headers.get('cache-control')).toBe('no-store');
  }finally{db.close();}
 });
 it('handles malformed requests and unrelated routes',async()=>{
  const env={MERCADOLIBRE_COLLECTOR_TOKEN:'ml'} as any;
  expect(await handleMercadoLibreBrowser(new Request('https://spawn.test/unrelated'),env)).toBeNull();
  for(const [body,status] of [['{',400],[' '.repeat(6001),413]] as const)expect((await handleMercadoLibreBrowser(new Request('https://spawn.test/internal/mercadolibre-browser/observe',{method:'POST',headers:{authorization:'Bearer ml'},body}),env))?.status).toBe(status);
 });
});
describe('Mercado Libre extension transport',()=>{
 it('stays local without a credential and uses only its own endpoint with a matching receipt',async()=>{
  const record=observation();let calls=0;
  const fetchFn=async(url:any,options:any)=>{calls++;expect(url).toBe('https://spawn.aztlan-eng.com/internal/mercadolibre-browser/observe');expect(options.headers.authorization).toBe('Bearer ml');expect(options.redirect).toBe('error');return Response.json({ok:true,id:record.id});};
  expect((await sendMercadoLibreObservation(record,'',fetchFn as any)).local).toBe(true);expect(calls).toBe(0);
  expect((await sendMercadoLibreObservation(record,'ml',fetchFn as any)).saved).toBe(true);expect(calls).toBe(1);
 });
 it('does not report saved for HTTP errors or mismatched acknowledgements',async()=>{
  await expect(sendMercadoLibreObservation(observation(),'ml',async()=>new Response('',{status:401}) as any)).rejects.toThrow('HTTP 401');
  await expect(sendMercadoLibreObservation(observation(),'ml',async()=>Response.json({ok:true,id:'wrong'}) as any)).rejects.toThrow('did not confirm');
 });
});
