import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerInventoryLinks,registerInventoryLinksRoute,inventoryRedirect,inventoryClickReport,parseInventoryLink,clickCategory} from '../src/outbound-links';
import {trackBoardLinks} from '../src/board-links';
import worker from '../src/index';

const row={url:'https://store.example/products/cards?variant=123',product:'Cards',source:'inventory_alert',route:'magic-main',kind:'NEW_INVENTORY',event_id:'event-1'};
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0041_inventory_link_clicks.sql',import.meta.url),'utf8'));
  const env:any={PUBLIC_BASE_URL:'https://spawn.example',INVENTORY_LINK_TRACKING_ENABLED:'true',CATCH_INGEST_SECRET:'fixture',SPAWN_DB:{
    prepare(sql:string){let values:any[]=[];return {bind(...args:any[]){values=args;return this;},
      async run(){const result=db.prepare(sql).run(...values);return {meta:{changes:result.changes}};},
      async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};}};},
    async batch(statements:any[]){return Promise.all(statements.map(statement=>statement.run()));}
  }};
  return {env,db};
}
describe('inventory outbound tracking',()=>{
  it('registers deterministic opaque links and preserves destination variants',async()=>{
    const {env,db}=fixture();const first=await registerInventoryLinks(env,[row]);
    expect(first[0]).toMatch(/^https:\/\/spawn.example\/r\/[a-f0-9]{64}$/);
    expect(await registerInventoryLinks(env,[row])).toEqual(first);
    expect((db.prepare('SELECT count(*) n FROM outbound_links').get() as any).n).toBe(1);
    expect((await inventoryRedirect(new Request(first[0]),env))?.headers.get('location')).toBe(row.url);
    db.close();
  });
  it('requires authentication and rejects open redirects and hunt attribution',async()=>{
    const {env,db}=fixture();const url='https://spawn.example/internal/garfield/inventory-links';
    expect((await registerInventoryLinksRoute(new Request(url,{method:'POST'}),env))?.status).toBe(401);
    for(const target of ['http://store.example/p','https://user:password@store.example/p','https://127.0.0.1/p','https://localhost/p','https://store.example/r/abc','javascript:alert(1)'])expect(parseInventoryLink({...row,url:target})).toBeNull();
    expect(parseInventoryLink({...row,source:'amazon_hunt'})).toBeNull();
    const response=await registerInventoryLinksRoute(new Request(url,{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({links:[row]})}),env);
    expect(response?.status).toBe(200);
    expect((await inventoryRedirect(new Request('https://spawn.example/r/'+'a'.repeat(64)+'?url=https://evil.example'),env))?.status).toBe(404);
    db.close();
  });
  it('counts GETs by day and category without visitor records; HEAD never counts',async()=>{
    const {env,db}=fixture();const [url]=await registerInventoryLinks(env,[row]);
    for(const agent of ['Mozilla/5.0','Mozilla/5.0','Discordbot',''])await inventoryRedirect(new Request(url,{headers:{'user-agent':agent}}),env);
    await inventoryRedirect(new Request(url,{method:'HEAD'}),env);
    const report=await (await inventoryClickReport(env,new URL('https://spawn.example/dashboard/link-clicks.json'))).json() as any;
    expect(Object.fromEntries(report.rows.map((r:any)=>[r.category,r.clicks]))).toEqual({filtered_click:2,automated:1,unclassified:1});
    expect(report.metric).toContain('not unique');
    expect(JSON.stringify(report)).not.toMatch(/Mozilla|Discordbot|ip_address|customer_id/);
    expect(clickCategory(new Request(url,{headers:{'user-agent':'Mozilla/5.0','sec-purpose':'prefetch'}}))).toBe('automated');
    db.close();
  });
  it('redirects without waiting for counting and remains usable when disabled',async()=>{
    const {env,db}=fixture();const [url]=await registerInventoryLinks(env,[row]);
    env.INVENTORY_LINK_TRACKING_ENABLED='false';
    expect((await inventoryRedirect(new Request(url),env))?.status).toBe(302);
    expect(await registerInventoryLinks(env,[row])).toEqual([row.url]);
    env.INVENTORY_LINK_TRACKING_ENABLED='true';
    const pending:Promise<unknown>[]=[];
    const original=env.SPAWN_DB.prepare;
    env.SPAWN_DB.prepare=(sql:string)=>sql.startsWith('INSERT INTO outbound_click_days')?{bind(){return this;},run(){return Promise.reject(new Error('D1 unavailable'));}}:original(sql);
    const response=await inventoryRedirect(new Request(url),env,{waitUntil(p){pending.push(p);}});
    expect(response?.status).toBe(302);expect(response?.headers.get('cache-control')).toBe('no-store');
    await Promise.all(pending);db.close();
  });
  it('serves redirects before operations authentication and protects the report',async()=>{
    const {env,db}=fixture();const [url]=await registerInventoryLinks(env,[row]);
    const pending:Promise<unknown>[]=[];
    const response=await worker.fetch(new Request(url),{...env,OPS_AUTH_MODE:'access'} as any,{waitUntil(p:Promise<unknown>){pending.push(p);}} as any);
    expect(response.status).toBe(302);
    const report=await worker.fetch(new Request('https://spawn.example/dashboard/link-clicks.json'),{...env,BOARD_ACCESS_TOKEN:'private'} as any,{} as any);
    expect(report.status).toBe(401);await Promise.all(pending);db.close();
  });
  it('tracks inventory board links without mutating canonical product identities',async()=>{
    const {env,db}=fixture();const input:any={listing_key:'listing-1',title:'Cards',canonical_url:row.url,watch_category:'mtg_tcg'};
    const hunt:any={rows:[],available:true};
    const result=await trackBoardLinks(env,[input],hunt);
    expect(result.rows[0].outbound_url).toContain('/r/');expect(result.rows[0].canonical_url).toBe(row.url);expect(input.outbound_url).toBeUndefined();
    db.close();
  });
});
