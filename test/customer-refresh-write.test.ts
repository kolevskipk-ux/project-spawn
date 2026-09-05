import {describe,it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {refreshStatements,type RefreshRecord} from '../src/customer-refresh-write';
describe('controlled refresh persistence',()=>{
 it('records evidence, updates matching snapshots once and skips concurrent source changes',()=>{
  const db=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+f,'utf8'));
  db.exec("INSERT INTO inventory(listing_key,canonical_url,retailer,title,watch_category,first_seen_at,last_seen_at,status,fulfilment_region_state) VALUES('test-id','https://store.test/product','Store','Product','pokemon_tcg','2026-01-01','2026-01-01','unknown','DOMESTIC')");
  const now=new Date(),row:RefreshRecord={id:'test-id',canonical_url:'https://store.test/product',last_seen_at:'2026-01-01',startedAt:new Date(now.getTime()-1000).toISOString(),finishedAt:now.toISOString(),httpStatus:200,outcome:'AVAILABLE',priceMxn:999,evidence:'Exact product',htmlHash:'hash'};
  const cte='WITH eligible AS (SELECT listing_key id FROM inventory)';
  const sql=refreshStatements(row,'test',cte,now).join('\n');db.exec(sql);db.exec(sql);
  expect(db.prepare('SELECT price_mxn,status FROM inventory').get()).toMatchObject({price_mxn:999,status:'available'});
  expect(db.prepare('SELECT count(*) n FROM inventory_revalidation_attempts').get()?.n).toBe(1);
  expect(db.prepare('SELECT evidence_revision FROM inventory_revalidation_state').get()?.evidence_revision).toBe(1);
  db.exec(refreshStatements({...row,priceMxn:1},'stale-form',cte,now).join('\n'));
  expect(db.prepare('SELECT price_mxn FROM inventory').get()?.price_mxn).toBe(999);
  expect(db.prepare('SELECT count(*) n FROM inventory_revalidation_attempts').get()?.n).toBe(1);
  expect(()=>refreshStatements({...row,finishedAt:'2000-01-01'},'old',cte,now)).toThrow();db.close();
 });
});
