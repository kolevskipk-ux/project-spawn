import type {Env} from './types';

export async function amazonApprovalSummary(env:Env,now=new Date()){
  const since=new Date(+now-86400000).toISOString();
  const [pending,attempts,rules]=await Promise.all([
    env.SPAWN_DB.prepare(`SELECT COALESCE((SELECT t.outcome FROM trusted_store_attempts t WHERE t.candidate_id=c.candidate_id ORDER BY attempted_at DESC LIMIT 1),'NOT_ATTEMPTED') reason,COUNT(*) count,MIN(c.discovered_at) oldest FROM monitoring_candidates c WHERE c.status='PENDING' AND c.source_url LIKE 'https://www.amazon.com.mx/%' GROUP BY reason`).all<{reason:string;count:number;oldest:string}>(),
    env.SPAWN_DB.prepare(`SELECT t.outcome,COUNT(DISTINCT t.candidate_id) count FROM trusted_store_attempts t JOIN monitoring_candidates c ON c.candidate_id=t.candidate_id WHERE c.source_url LIKE 'https://www.amazon.com.mx/%' AND t.attempted_at>=? GROUP BY t.outcome`).bind(since).all<{outcome:string;count:number}>(),
    env.SPAWN_DB.prepare("SELECT COUNT(*) count FROM trusted_store_rules WHERE origin='https://www.amazon.com.mx' AND enabled=1 AND include_pending=1").first<{count:number}>()
  ]);
  return {at:now.toISOString(),pending:pending.results,attempts:attempts.results,enabledSellerPolicies:rules?.count??0};
}
export async function sendAmazonApprovalDigest(env:Env,now=new Date(),fetchFn:typeof fetch=fetch){
  if(env.AMAZON_APPROVAL_DIGEST_ENABLED!=='true'||!env.OPS_DISCORD_WEBHOOK_URL||now.getUTCHours()<15)return {enabled:false};
  const date=now.toISOString().slice(0,10),at=now.toISOString();
  const snapshot=await amazonApprovalSummary(env,now);
  await env.SPAWN_DB.prepare('INSERT OR IGNORE INTO amazon_approval_digests(digest_date,created_at,payload_json) VALUES(?,?,?)').bind(date,at,JSON.stringify(snapshot)).run();
  const lease=crypto.randomUUID();
  const locked=await env.SPAWN_DB.prepare('UPDATE amazon_approval_digests SET lease_id=?,lease_until=? WHERE digest_date=? AND delivered_at IS NULL AND (lease_until IS NULL OR lease_until<?)').bind(lease,new Date(+now+180000).toISOString(),date,at).run();
  if(!locked.meta.changes)return {enabled:true,delivered:false};
  const row=await env.SPAWN_DB.prepare('SELECT payload_json FROM amazon_approval_digests WHERE digest_date=? AND lease_id=?').bind(date,lease).first<{payload_json:string}>();
  const data=JSON.parse(row!.payload_json) as typeof snapshot;
  const content=['**Amazon approvals — daily operations digest**',`Active seller policies: ${data.enabledSellerPolicies}`,`Pending: ${data.pending.reduce((n,r)=>n+r.count,0)}`,...data.pending.map(r=>`${r.reason}: ${r.count} · oldest ${r.oldest}`),...data.attempts.map(r=>`Last 24h ${r.outcome}: ${r.count} candidates`),`${env.PUBLIC_BASE_URL}/ops/trusted-stores`].join('\n');
  try{
    const response=await fetchFn(env.OPS_DISCORD_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:content.slice(0,1900),allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(`Discord HTTP ${response.status}`);
    await env.SPAWN_DB.prepare('UPDATE amazon_approval_digests SET delivered_at=?,lease_id=NULL,lease_until=NULL,last_error=NULL WHERE digest_date=? AND lease_id=?').bind(at,date,lease).run();
    return {enabled:true,delivered:true};
  }catch(error){await env.SPAWN_DB.prepare('UPDATE amazon_approval_digests SET last_error=? WHERE digest_date=? AND lease_id=?').bind(String((error as Error).message).slice(0,200),date,lease).run();return {enabled:true,delivered:false};}
}
