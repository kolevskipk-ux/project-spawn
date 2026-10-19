import type {Env} from './types';
import {importStoreCatalog,storeSuppressed,type Store} from './store-catalog';
type Job={store_id:string;cursor:string;revision:number};

export async function queueStoreImport(env:Env,storeId:string,reset=true){
 const at=new Date().toISOString();
 await env.SPAWN_DB.prepare(`INSERT INTO store_import_jobs(store_id,status,requested_at,next_due_at)
  SELECT ?,'QUEUED',?,? WHERE EXISTS(SELECT 1 FROM store_acquisitions WHERE id=? AND status='APPROVED' AND marketplace=0)
  ON CONFLICT(store_id) DO UPDATE SET status='QUEUED',cursor=CASE WHEN ? THEN '' ELSE store_import_jobs.cursor END,revision=store_import_jobs.revision+1,
  requested_at=excluded.requested_at,next_due_at=excluded.next_due_at,last_error=NULL`)
  .bind(storeId,at,at,storeId,Number(reset)).run();
}

// One saved-catalog chunk per existing minute tick. No fetch or paid acquisition.
export async function runStoreImportJob(env:Env,now=new Date()){
 if(env.STORE_REVIEW_IMPORT_ENABLED!=='true')return;
 const owner=crypto.randomUUID(),stamp=now.toISOString();
 if(!await env.SPAWN_DB.prepare("SELECT 1 FROM store_import_jobs WHERE status='QUEUED' AND next_due_at<=? ORDER BY next_due_at,store_id LIMIT 1").bind(stamp).first())return;
 const lease=await env.SPAWN_DB.prepare(`INSERT INTO ops_review_locks(resource,owner,expires_at) VALUES('store-review-import',?,?)
  ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE ops_review_locks.expires_at<?`)
  .bind(owner,+now+180000,+now).run();
 if(!lease.meta.changes)return;
 let job:Job|null=null;
 try{
  job=await env.SPAWN_DB.prepare("SELECT store_id,cursor,revision FROM store_import_jobs WHERE status='QUEUED' AND next_due_at<=? ORDER BY next_due_at,store_id LIMIT 1").bind(stamp).first<Job>();
  if(!job)return;
  const store=await env.SPAWN_DB.prepare('SELECT * FROM store_acquisitions WHERE id=?').bind(job.store_id).first<Store>();
  if(store?.status!=='APPROVED'){
   await env.SPAWN_DB.prepare("UPDATE store_import_jobs SET status='CANCELLED' WHERE store_id=? AND revision=?").bind(job.store_id,job.revision).run();return;
  }
  if(store.marketplace||await storeSuppressed(env,store))throw Error('Store unavailable');
  const rows=(await env.SPAWN_DB.prepare('SELECT url FROM store_catalog_items WHERE store_id=? AND url>? ORDER BY url LIMIT 41').bind(job.store_id,job.cursor).all<{url:string}>()).results;
  const batch=rows.slice(0,40),through=batch.at(-1)?.url??job.cursor;
  if(batch.length)await importStoreCatalog(env,job.store_id,{after:job.cursor,through});
  const current=await env.SPAWN_DB.prepare('SELECT revision,status FROM store_acquisitions WHERE id=?').bind(job.store_id).first<{revision:number;status:string}>();
  // Item/store decisions invalidate the import snapshot. Retry this range rather
  // than advancing over products whose guarded writes were intentionally skipped.
  if(current?.revision!==store.revision||current.status!=='APPROVED')return;
  await env.SPAWN_DB.prepare('UPDATE store_import_jobs SET cursor=?,status=?,next_due_at=?,last_error=NULL WHERE store_id=? AND revision=?')
   .bind(through,rows.length>40?'QUEUED':'COMPLETE',new Date(+now+60000).toISOString(),job.store_id,job.revision).run();
 }catch{
  // Deliberate retry from the saved cursor; do not spin indefinitely on failures.
  if(job)await env.SPAWN_DB.prepare("UPDATE store_import_jobs SET status='ERROR',last_error='Import failed; review and retry the saved batch' WHERE store_id=? AND revision=?").bind(job.store_id,job.revision).run();
 }finally{
  await env.SPAWN_DB.prepare("DELETE FROM ops_review_locks WHERE resource='store-review-import' AND owner=?").bind(owner).run();
 }
}
