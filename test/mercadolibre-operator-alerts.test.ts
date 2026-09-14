import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {deliverMercadoLibreOperatorAlerts,possibleMercadoLibreRestock} from '../src/mercadolibre-operator-alerts';
const base={itemId:'MLM5984323768',title:'Pokemon 30th Celebration Booster Bundle 6pk',visibleItemId:'MLM5984323768',state:'unknown',pageAvailability:null,purchaseEnabled:true,priceMxn:589,reason:'SELLER_REVIEW_REQUIRED'};
it('requires actual purchase evidence; missing offer, wrong seller, challenge and unknown products do not trigger',()=>{
 expect(possibleMercadoLibreRestock(base)).toBe(true);
 for(const patch of [{purchaseEnabled:false},{priceMxn:null},{visibleItemId:null},{reason:'SELLER_MISMATCH'},{reason:'PRIMARY_OFFER_MISSING'},{state:'blocked'},{pageAvailability:'sold_out'},{title:'Unrelated toy'},{itemId:'other'}])expect(possibleMercadoLibreRestock({...base,...patch})).toBe(false);
});
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0042_mercadolibre_browser_observations.sql','0043_mercadolibre_operator_alerts.sql'])db.exec(readFileSync('migrations/'+file,'utf8'));
 const prepare=(sql:string)=>{let args:any[]=[];return {bind(...v:any[]){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async run(){return db.prepare(sql).run(...args);}};};
 const env={MERCADOLIBRE_OPERATOR_ALERTS_ENABLED:'true',OPS_DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz',SPAWN_DB:{prepare}} as any;
 const add=(id:string,at:string,patch:any={})=>{const record={...base,...patch};db.prepare('INSERT INTO mercadolibre_browser_observations(id,item_id,observed_at,received_at,state,page_availability,evidence_json) VALUES(?,?,?,?,?,?,?)').run(id,base.itemId,at,at,record.state,record.pageAvailability,JSON.stringify(record));};
 return {db,env,add};
}
it('alerts once per sold-out episode, rearms after sold-out, and routes only to Ops',async()=>{
 const {db,env,add}=fixture();let calls=0;
 const fetchFn=async(url:any,options:any)=>{calls++;expect(url).toContain('discord.com/api/webhooks/123456789/');const payload=JSON.parse(options.body);expect(payload.content).toContain('POSSIBLE MERCADO LIBRE RESTOCK');expect(payload.content).toContain('no customer alert');expect(payload.allowed_mentions).toEqual({parse:[]});return new Response('',{status:200});};
 try{
  add('sold','2026-09-14T00:00:00Z',{purchaseEnabled:false,pageAvailability:'sold_out'});
  add('buy','2026-09-14T00:30:00Z');
  await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T00:31:00Z'));
  await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T00:32:00Z'));expect(calls).toBe(1);
  add('buy2','2026-09-14T01:00:00Z');await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T01:01:00Z'));expect(calls).toBe(1);
  add('sold2','2026-09-14T01:30:00Z',{purchaseEnabled:false,pageAvailability:'sold_out'});add('buy3','2026-09-14T02:00:00Z');
  await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T02:01:00Z'));expect(calls).toBe(2);
 }finally{db.close();}
});
it('retries failed deliveries after lease expiry without duplicate successful sends',async()=>{
 const {db,env,add}=fixture();let calls=0;
 try{
  add('sold','2026-09-14T00:00:00Z',{purchaseEnabled:false,pageAvailability:'sold_out'});add('buy','2026-09-14T00:30:00Z');
  const fetchFn=async()=>{calls++;return new Response('',{status:calls===1?500:200});};
  await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T00:31:00Z'));
  await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T00:32:00Z'));expect(calls).toBe(1);
  await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T00:34:00Z'));expect(calls).toBe(2);
  expect(db.prepare('SELECT delivered_at FROM mercadolibre_operator_alerts').get()?.delivered_at).toBeTruthy();
 }finally{db.close();}
});
it('does not alert without a baseline, while disabled, or on stale/blocked latest checks',async()=>{
 const {db,env,add}=fixture();let calls=0;const fetchFn=async()=>{calls++;return new Response('',{status:200});};
 try{
  add('buy','2026-09-14T00:30:00Z');await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T00:31:00Z'));
  add('sold','2026-09-14T00:00:00Z',{purchaseEnabled:false,pageAvailability:'sold_out'});
  await deliverMercadoLibreOperatorAlerts({...env,MERCADOLIBRE_OPERATOR_ALERTS_ENABLED:'false'},fetchFn as any,new Date('2026-09-14T00:31:00Z'));
  await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T01:31:00Z'));
  add('blocked','2026-09-14T00:35:00Z',{state:'blocked',reason:'ACCOUNT_VERIFICATION',purchaseEnabled:false});
  await deliverMercadoLibreOperatorAlerts(env,fetchFn as any,new Date('2026-09-14T00:36:00Z'));expect(calls).toBe(0);
 }finally{db.close();}
});
