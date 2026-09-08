import type {Env} from './types';

const MAX_AUDIT_CHARACTERS=100_000;

export async function recordSearchAudit(env:Env,scanId:string,eventType:string,details:unknown):Promise<void> {
  const serialized=JSON.stringify(details);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
  const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const truncated=serialized.length>MAX_AUDIT_CHARACTERS;
  const retained=truncated?JSON.stringify({truncated:true,original_characters:serialized.length,prefix:serialized.slice(0,MAX_AUDIT_CHARACTERS)}):serialized;
  await env.SPAWN_DB.prepare(`INSERT INTO search_audit_events(scan_id,occurred_at,event_type,details_json,details_sha256,truncated) VALUES(?,?,?,?,?,?)`)
    .bind(scanId,new Date().toISOString(),eventType,retained,hash,Number(truncated)).run();
}

// Do not persist headers, API credentials, hidden reasoning, or arbitrary SDK
// diagnostics. Search actions/sources are provider evidence, not access proofs.
export function searchResponseEvidence(payload:unknown):Record<string,unknown> {
  const value=payload&&typeof payload==='object'?payload as Record<string,unknown>:{};
  const output=Array.isArray(value.output)?value.output:[];
  return {
    response_id:value.id??null,model:value.model??null,status:value.status??null,
    service_tier:value.service_tier??null,usage:value.usage??null,
    incomplete_details:value.incomplete_details??null,
    searches:output.filter(item=>item?.type==='web_search_call').map(item=>({id:item.id??null,status:item.status??null,action:item.action??null})),
    returned_text:value.output_text??output.filter(item=>item?.type==='message').flatMap(item=>Array.isArray(item.content)?item.content:[])
      .filter(item=>item?.type==='output_text').map(item=>({text:item.text,annotations:item.annotations??[]})),
    evidence_scope:'Provider-reported search actions and sources; inclusion does not prove a page was accessible or its stock was verified.'
  };
}

export async function searchAuditDetail(env:Env,scanId:string) {
  const [events,scan,accounting,observations]=await Promise.all([
    env.SPAWN_DB.prepare('SELECT * FROM search_audit_events WHERE scan_id=? ORDER BY id').bind(scanId).all<Record<string,unknown>>(),
    env.SPAWN_DB.prepare('SELECT * FROM scan_runs WHERE id=?').bind(scanId).first(),
    env.SPAWN_DB.prepare('SELECT * FROM search_accounting WHERE scan_id=?').bind(scanId).first(),
    env.SPAWN_DB.prepare('SELECT * FROM inventory_observations WHERE scan_id=? ORDER BY listing_key').bind(scanId).all()
  ]);
  return {scan_id:scanId,events:events.results,scan,accounting,observations:observations.results};
}
