"""Offline SQLite execution work, not D1 billed rows or a cost guarantee."""
import json,re,sqlite3,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
source=(root/'src/store-review.ts').read_text(encoding='utf-8')
query=re.search(r'export const storeProductsSql=`(.*?)`;',source,re.S).group(1)
results=[]
for size in [1000,100000]:
 db=sqlite3.connect(':memory:')
 for path in sorted((root/'migrations').glob('*.sql')):db.executescript(path.read_text(encoding='utf-8-sig'))
 db.execute("INSERT INTO store_acquisitions(id,origin,retailer,vendor_key,created_at) VALUES('bench','https://bench.example','Bench','bench','now')")
 db.executemany("INSERT INTO inventory(listing_key,canonical_url,retailer,title,watch_category,first_seen_at,last_seen_at,status,language) VALUES(?,?,'Bench','Product','pokemon_tcg','now','now','unknown','unknown')",((f'b{i:06}',f'https://bench.example/products/{i:06}') for i in range(size)))
 db.executemany("INSERT INTO store_catalog_items(store_id,url,title,evidence_note,first_seen_at,last_seen_at,first_run_id,last_run_id) VALUES('bench',?,'Product','fixture','now','now','fixture','fixture')",((f'https://bench.example/products/{i:06}',) for i in range(size)))
 db.commit();steps=[0]
 def progress():steps[0]+=1;return 0
 args=('bench','','https://bench.example/','https://bench.example0','','bench','bench','bench')
 plan=[r[3] for r in db.execute('EXPLAIN QUERY PLAN '+query,args)]
 assert not any(re.search(r'SCAN (?:inventory|store_catalog_items)\b',p) for p in plan),plan
 db.set_progress_handler(progress,1);rows=db.execute(query,args).fetchall();db.set_progress_handler(None,0)
 assert len(rows)==26
 results.append({'inventory_rows':size,'catalog_rows':size,'returned':len(rows),'sqlite_vm_steps':steps[0],'plan':plan})
 db.close()
assert results[1]['sqlite_vm_steps']<=results[0]['sqlite_vm_steps']*1.2+200,results
print(json.dumps({'scope':'offline SQLite VM work; not billed D1 rows','results':results},indent=2))
