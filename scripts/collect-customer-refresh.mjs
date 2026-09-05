import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {selected} from './customer-refresh-db.mjs';
import {assessProductEvidence} from '../src/product-page-evidence.ts';
const mode=process.argv[2]??'collect';
if(mode!=='collect')throw Error('Use collect; applying evidence is a separate reviewed step.');
const rows=await selected();if(rows.some(r=>!/^[a-zA-Z0-9_-]{1,100}$/.test(r.id)||new URL(r.canonical_url).protocol!=='https:'))throw Error('Invalid source URL or listing key');if(rows.length>55)throw Error('Refresh scope grew beyond the approved 55; review scope first');
const runId=new Date().toISOString().replace(/[:.]/g,'-'),folder=resolve('artifacts','customer-refresh-'+runId);await mkdir(folder,{recursive:true});
const report={runId,startedAt:new Date().toISOString(),database:'project-spawn',rows:[]};const blocked=new Set();
for(const row of rows){const host=new URL(row.canonical_url).hostname;
 if(blocked.has(host)){report.rows.push({...row,attempted:false,outcome:'SKIPPED',evidence:'domain_blocked_earlier_in_run'});continue;}
 let result,httpStatus=0,html='',finalUrl=row.canonical_url;const startedAt=new Date().toISOString();
 try{
  let response=await fetch(row.canonical_url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'user-agent':'Mozilla/5.0 (compatible; ProjectGarfield/1.0; one-time inventory review)',accept:'text/html'}});
  if([301,302,307,308].includes(response.status)){const next=new URL(response.headers.get('location')??'',row.canonical_url),expected=new URL(row.canonical_url);if(next.protocol==='https:'&&next.hostname===host&&next.pathname.replace(/\/$/,'')===expected.pathname.replace(/\/$/,'')&&next.search===expected.search){finalUrl=next.toString();response=await fetch(finalUrl,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'user-agent':'Mozilla/5.0 (compatible; ProjectGarfield/1.0; one-time inventory review)',accept:'text/html'}});}}
  httpStatus=response.status;
  const reader=response.body?.getReader();let bytes=0;const chunks=[];
  if(reader)while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>2_000_000){await reader.cancel();throw Error('page_size_limit');}chunks.push(Buffer.from(chunk.value));}
  html=Buffer.concat(chunks).toString('utf8');result=assessProductEvidence(httpStatus,html,row.canonical_url,row.title,row.retailer_sku);
 }catch(error){result={outcome:'ERROR',priceMxn:null,evidence:error.message==='page_size_limit'?'page_size_limit':'transport_error'};}
 if(result.outcome==='BLOCKED')blocked.add(host);
 const record={...row,attempted:true,startedAt,finishedAt:new Date().toISOString(),httpStatus,finalUrl,...result};report.rows.push(record);
 await writeFile(resolve(folder,row.id+'.html'),html);await writeFile(resolve(folder,'report.json'),JSON.stringify(report,null,2));
 if(report.rows.length%10===0)console.log(JSON.stringify({processed:report.rows.length,total:rows.length}));
}
report.finishedAt=new Date().toISOString();await writeFile(resolve(folder,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({report:resolve(folder,'report.json'),total:report.rows.length,outcomes:report.rows.reduce((s,r)=>(s[r.outcome]=(s[r.outcome]??0)+1,s),{}),verifiedPrices:report.rows.filter(r=>r.priceMxn!=null).length}));
