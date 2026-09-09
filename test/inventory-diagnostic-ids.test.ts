import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {boardRows,renderBoard} from '../src/board';
import type {Env} from '../src/types';

it('backfills UUIDs and preserves diagnostic identity across updates and recreation',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    const migration='0031_inventory_diagnostic_ids.sql';
    for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')&&n<migration).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
    const insert=()=>db.exec("INSERT INTO inventory(listing_key,canonical_url,retailer,title,watch_category,first_seen_at,last_seen_at,status,fulfilment_region_state) VALUES('example','https://example.test/item','Example','Original title','delta_reign','2026-09-09','2026-09-09','unknown','DOMESTIC')");
    insert();
    db.exec(readFileSync('migrations/'+migration,'utf8'));
    const lookup=()=>db.prepare("SELECT diagnostic_id FROM inventory_diagnostic_ids WHERE source='inventory' AND source_key='example'").get()!.diagnostic_id as string;
    const id=lookup();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    db.exec("UPDATE inventory SET title='Renamed',price_mxn=300 WHERE listing_key='example'");
    expect(lookup()).toBe(id);
    db.exec("INSERT INTO inventory(listing_key,canonical_url,retailer,title,watch_category,first_seen_at,last_seen_at,status) VALUES('new','https://example.test/new','Example','New listing','delta_reign','2026-09-09','2026-09-09','unknown')");
    const newId=db.prepare("SELECT diagnostic_id FROM inventory_diagnostic_ids WHERE source='inventory' AND source_key='new'").get()!.diagnostic_id;
    expect(newId).not.toBe(id);
    expect(newId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    db.exec("DELETE FROM inventory WHERE listing_key='example'");insert();
    expect(lookup()).toBe(id);
    const identities=db.prepare('SELECT diagnostic_id FROM inventory_diagnostic_ids').all();
    expect(new Set(identities.map(row=>row.diagnostic_id)).size).toBe(identities.length);
    expect(db.prepare("SELECT diagnostic_id FROM inventory_diagnostic_ids WHERE source='amazon' AND source_key='B0HG3RVZLW'").get()).toBeTruthy();
    for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')&&n>migration).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
    const env={SPAWN_DB:{prepare:(sql:string)=>({all:async()=>({results:db.prepare(sql).all()})})}} as unknown as Env;
    const rows=await boardRows(env);
    expect(rows[0].diagnostic_id).toBe(id);
    const html=renderBoard(rows,'test');
    expect(html).toContain(`Diagnostic ID: <code`);
    expect(html).toContain(id);
    expect(html).toMatch(new RegExp(`data-search="[^"]*${id}`));
  } finally {db.close();}
});
