import {approvalNote} from './approval-note';
import type {Env} from './types';
import {catalogLanguageAllowed} from './contracts/amazon-catalog.mjs';

export interface IdentityReview {
  attemptId: number;
  evidenceRevision: string;
  productName: string;
  setName: string;
  format: string;
  language: string;
  evidenceUrl: string;
  reason: string;
  acknowledgeUnknown: boolean;
}

// Resolution records a new immutable attempt. It never approves or publishes.
export async function resolveAmazonIdentity(env: Env, asin: string, input: IdentityReview, actor: string, now = new Date()) {
  const row = await env.SPAWN_DB.prepare(`SELECT w.lifecycle_status,w.verification_attempt_id,w.evidence_revision,
    a.* FROM amazon_watchlist w JOIN amazon_verification_attempts a ON a.id=w.verification_attempt_id WHERE w.asin=?`)
    .bind(asin).first<Record<string,unknown>>();
  if (!row || !['DISCOVERED','VERIFIED'].includes(String(row.lifecycle_status))) return {ok:false as const,error:'identity_review_unavailable'};
  if (Number(row.verification_attempt_id) !== input.attemptId || row.evidence_revision !== input.evidenceRevision)
    return {ok:false as const,error:'stale_evidence'};
  const age = now.getTime() - Date.parse(String(row.completed_at));
  let gates: Record<string,boolean>;
  try { gates = JSON.parse(String(row.gate_results_json)); } catch { return {ok:false as const,error:'verification_required'}; }
  if (!['REVIEW_REQUIRED','VERIFIED'].includes(String(row.outcome)) || row.access_outcome !== 'VALID_PAGE' || !Number.isFinite(age) || age < 0 || age > 36 * 3_600_000 ||
      !['directAmazonMxUrl','httpSuccess','amazonPage','expectedAsin','notRobotBlocked'].every(key=>gates?.[key] === true))
    return {ok:false as const,error:'verification_required'};
  const productName=input.productName.trim(),setName=input.setName.trim(),format=input.format.trim(),reason=approvalNote(input.reason,"identity review");
  let evidenceUrl: URL;
  try { evidenceUrl=new URL(input.evidenceUrl); } catch { return {ok:false as const,error:'identity_evidence_required'}; }
  if (![productName,setName,format,reason].every(value=>value.length>=3 && value.length<=500) ||
      evidenceUrl.protocol!=='https:' || evidenceUrl.username || evidenceUrl.password || !catalogLanguageAllowed(input.language) ||
      (input.language==='unknown'&&!input.acknowledgeUnknown)) return {ok:false as const,error:'identity_evidence_required'};
  const revision=crypto.randomUUID(),stamp=now.toISOString();
  // New identities remain listing-specific until a separate, evidence-backed grouping review.
  // This preserves old canonical IDs and avoids guessing that two retailer variants are identical.
  const identity=row.outcome==='VERIFIED'&&row.product_name===productName&&row.language===input.language&&row.canonical_product_id
    ? String(row.canonical_product_id) : `amazon-${asin.toLowerCase()}-${input.language}`;
  const evidence=JSON.stringify({previous_attempt_id:input.attemptId,product_name:productName,set:setName,format,
    language:input.language,language_unconfirmed:input.language==='unknown',evidence_url:evidenceUrl.href,reason,reviewed_by:actor});
  const results=await env.SPAWN_DB.batch([
    env.SPAWN_DB.prepare(`INSERT INTO amazon_verification_attempts
      (asin,evidence_revision,started_at,completed_at,outcome,method,access_outcome,http_status,product_url,
       canonical_product_id,product_name,watch_category,language,retailer,retailer_identifier,observed_availability,
       evidence_json,gate_results_json,confidence,unresolved_questions,created_by)
       SELECT a.asin,?,?,?,'VERIFIED',CASE WHEN ? LIKE 'auto:%' THEN 'policy_resolution' ELSE 'operator_resolution' END,a.access_outcome,a.http_status,a.product_url,
       ?,?,a.watch_category,?,a.retailer,a.retailer_identifier,a.observed_availability,?,?,'MEDIUM',?,?
      FROM amazon_verification_attempts a JOIN amazon_watchlist w ON w.verification_attempt_id=a.id
      WHERE w.asin=? AND w.lifecycle_status IN ('DISCOVERED','VERIFIED') AND w.evidence_revision=?`)
      .bind(revision,stamp,stamp,actor,identity,productName,input.language,evidence,
        JSON.stringify({...gates,canonicalIdentity:true,languageRecorded:true,operatorResolved:!actor.startsWith('auto:'),policyResolved:actor.startsWith('auto:')}),
        input.language==='unknown'?'Language unconfirmed; explicitly acknowledged by administrator':null,actor,asin,input.evidenceRevision),
    env.SPAWN_DB.prepare(`UPDATE amazon_watchlist SET verification_attempt_id=(SELECT id FROM amazon_verification_attempts WHERE evidence_revision=?),
      evidence_revision=?,product_name=?,language=?,canonical_product_id=?,lifecycle_status='VERIFIED',verified_at=?,updated_at=?,staging_enabled=0
      WHERE asin=? AND lifecycle_status IN ('DISCOVERED','VERIFIED') AND evidence_revision=?`)
      .bind(revision,revision,productName,input.language,identity,stamp,stamp,asin,input.evidenceRevision)
  ]);
  if (results[1].meta.changes!==1) return {ok:false as const,error:'stale_evidence'};
  return {ok:true as const,asin,evidenceRevision:revision};
}
