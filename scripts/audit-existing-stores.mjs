// Local rehearsal only: reads a saved, read-only D1 inventory export.
// Optional --inspect=N fetches up to eight public pages for each of N stores.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
registerHooks({
  resolve(specifier,context,next){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))specifier+='.ts';return next(specifier,context);},
  load(url,context,next){if(url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context);}
});
const {auditKnownStores,startCatalogRun,runCatalogTick}=await import('../src/store-catalog.ts');
const input=process.argv.find(v=>v.startsWith('--input='))?.slice(8)??'artifacts/store-inventory-audit.json';
const inspect=Number(process.argv.find(v=>v.startsWith('--inspect='))?.slice(10)??0);
if(!Number.isInteger(inspect)||inspect<0||inspect>5)throw new Error('Inspect must be 0–5');
const snapshot=JSON.parse(readFileSync(resolve(input),'utf8'));
const rows=snapshot.flatMap(page=>page.results??[]);
const db=new DatabaseSync(':memory:');
for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
for(const [index,row] of rows.entries())db.prepare("INSERT OR IGNORE INTO inventory(listing_key,canonical_url,retailer,title,watch_category,first_seen_at,last_seen_at,status) VALUES(?,?,?,'Existing inventory listing','unknown','2026-09-09','2026-09-09','unknown')").run(String(index),row.canonical_url,row.retailer);
const prepare=sql=>{let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)??null;},async all(){return {results:db.prepare(sql).all(...values)};},execute(){const r=db.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};},async run(){return this.execute();}};};
const env={SPAWN_DB:{prepare,async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>s.execute());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}}};
const report={generated_at:new Date().toISOString(),scope:'Local database rehearsal; no production mutations or approvals',inventory_rows:rows.length,...await auditKnownStores(env),stores:[]};
const stores=db.prepare(`SELECT s.*,(SELECT COUNT(*) FROM inventory i WHERE i.canonical_url LIKE s.origin||'/%') known_items FROM store_acquisitions s ORDER BY known_items DESC`).all();
let checked=0;
for(const store of stores){
  if(!store.marketplace&&checked<inspect){checked++;await startCatalogRun(env,store.id,'local-rehearsal');await runCatalogTick(env,store.id);}
  report.stores.push({origin:store.origin,retailer:store.retailer,known_items:store.known_items,marketplace:Boolean(store.marketplace),run:db.prepare('SELECT status,note FROM store_catalog_runs WHERE store_id=?').get(store.id)??null,
    pages:db.prepare('SELECT p.url,p.kind,p.state,p.detail FROM store_catalog_pages p JOIN store_catalog_runs r ON r.id=p.run_id WHERE r.store_id=?').all(store.id),
    products_found:db.prepare('SELECT COUNT(*) n FROM store_catalog_items WHERE store_id=?').get(store.id).n});
}
writeFileSync('artifacts/existing-store-rehearsal.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({inventory_rows:report.inventory_rows,stores:report.stores.length,marketplaces:report.stores.filter(s=>s.marketplace).length,inspected:checked,results:report.stores.filter(s=>s.run).map(s=>({origin:s.origin,run:s.run,pages:s.pages.filter(p=>p.state!=='PENDING'),products_found:s.products_found}))},null,2));
db.close();
