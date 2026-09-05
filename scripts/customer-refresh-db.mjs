import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {customerInventory} from '../src/customer-feed.ts';
const execute=promisify(execFile),root=process.cwd(),wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
if(config.name!=='project-spawn'||config.d1_databases.find(d=>d.binding==='SPAWN_DB')?.database_id!=='8fd44e8d-9ffc-4f9b-8c2c-f6ba1a9827aa')throw Error('Unexpected production target');
const sqlValue=v=>v==null?'NULL':typeof v==='number'?(Number.isFinite(v)?String(v):'NULL'):"'"+String(v).replaceAll("'","''")+"'";
export async function query(sql){const {stdout}=await execute(process.execPath,[wrangler,'d1','execute','SPAWN_DB','--remote','--config','wrangler.jsonc','--command',sql,'--json'],{cwd:root,maxBuffer:5_000_000,windowsHide:true});const body=JSON.parse(stdout);if(body.some(r=>!r.success))throw Error('Database query failed');return body;}
export async function scope(){let captured='';await customerInventory({SPAWN_DB:{prepare(sql){return {bind(...values){if(!captured){let index=0;captured=sql.replace(/\?/g,()=>sqlValue(values[index++]));}return this;}}},batch:async()=>[{results:[]},{results:[]}]}},new URL('https://source/inventory'));return captured.slice(0,captured.indexOf(' SELECT id,title,set_name,retailer,language,price_mxn,availability,observed_at FROM eligible'));}
export async function selected(){const cte=await scope();return (await query(cte+` SELECT e.id,i.canonical_url,i.title,i.retailer,i.retailer_sku,i.last_seen_at,i.price_mxn,i.status FROM eligible e JOIN inventory i ON i.listing_key=e.id WHERE NOT EXISTS(SELECT 1 FROM amazon_watchlist w WHERE w.product_url=i.canonical_url AND w.lifecycle_status IN ('VERIFIED','APPROVED','PUBLISHED')) ORDER BY e.retailer,e.id LIMIT 56;`))[0].results;}
