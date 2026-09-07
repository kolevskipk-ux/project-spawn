import type {Env} from './types';
import {catalogLanguageAllowed,catalogRoute} from './contracts/amazon-catalog.mjs';
import {resolveAmazonIdentity} from './identity-review';
import {reviewAmazonCandidate,runAmazonVerification,type ReviewInput} from './verification';

export const approvalWatch=(env:Env,asin:string)=>env.SPAWN_DB.prepare(`SELECT w.*,a.completed_at,a.outcome,a.evidence_json
  FROM amazon_watchlist w LEFT JOIN amazon_verification_attempts a ON a.id=w.verification_attempt_id WHERE w.asin=?`).bind(asin).first<Record<string,unknown>>();

// One operator intent, with immutable evidence and existing lifecycle audit records.
// A retry resumes an approved target without creating a second approval/publication.
export async function prepareProductApproval(env:Env,asin:string,form:FormData,actor:string) {
  let row=await approvalWatch(env,asin);
  if(!row||row.lifecycle_status==='REJECTED')return {ok:false as const,error:'not_found_or_reviewed'};
  if(String(row.evidence_revision??'')!==String(form.get('evidence_revision')??''))return {ok:false as const,error:'stale_evidence'};
  const fields:Record<string,string>={};
  const value=(key:string)=>String(form.get(key)??'').trim();
  if(!['visibility_only','monitor'].includes(value('destination')))fields.destination='Choose inventory only or inventory with Catch.';
  if(!catalogLanguageAllowed(value('language')))fields.language='Select a card language, including Language unconfirmed.';
  if(value('product_name').length<3||value('product_name').length>500)fields.product_name='Enter the product name (3–500 characters).';
  const changed=row.product_name!==value('product_name')||row.language!==value('language');
  const needsIdentity=row.outcome!=='VERIFIED'||changed;
  if(needsIdentity)for(const key of ['set_name','format'])if(value(key).length<3||value(key).length>500)fields[key]='Confirm this detail (3–500 characters).';
  if(!['5','60'].includes(value('cadence')||'60'))fields.cadence='Choose hourly or every five minutes.';
  if(!['normal','priority'].includes(value('lane')||'normal'))fields.lane='Choose normal or priority.';
  if(['APPROVED','PUBLISHED'].includes(String(row.lifecycle_status))&&changed)fields.product_name='This identity was already approved. Refresh before changing it.';
  if(Object.keys(fields).length)return {ok:false as const,error:'Check the highlighted details.',fields};
  const reason=value('reason')||`Product reviewed; language: ${value('language')}; destination: ${value('destination')}. Existing direct listing used as evidence.`;
  form.set('reason',reason);
  if(!['APPROVED','PUBLISHED'].includes(String(row.lifecycle_status))){
    const age=Date.now()-Date.parse(String(row.completed_at));
    if(!Number.isFinite(age)||age<0||age>36*3_600_000){
      // Verification during an active review must not send a redundant Discord request.
      const verified=await runAmazonVerification(env,asin,actor,fetch,{requestApproval:false});
      if(!verified.ok)return verified;
      row=(await approvalWatch(env,asin))!;
      // Return the refreshed revision even on failure so the form can retry safely.
      form.set('evidence_revision',String(row.evidence_revision));
    }
    if(row.outcome!=='VERIFIED'||changed){
      for(const key of ['set_name','format'])if(value(key).length<3||value(key).length>500)fields[key]='Confirm this detail (3–500 characters).';
      if(Object.keys(fields).length)return {ok:false as const,error:'Confirm the missing details using the refreshed listing evidence.',fields};
      const resolved=await resolveAmazonIdentity(env,asin,{attemptId:Number(row.verification_attempt_id),evidenceRevision:String(row.evidence_revision),
        productName:value('product_name'),setName:value('set_name'),format:value('format'),language:value('language'),
        evidenceUrl:String(row.product_url),reason,acknowledgeUnknown:value('language')==='unknown'},actor);
      if(!resolved.ok)return {...resolved,error:resolved.error==='verification_required'?'Amazon could not confirm an accessible, matching product page. Your entries are preserved; retry when the listing can be checked.':resolved.error};
      row=(await approvalWatch(env,asin))!;
      form.set('evidence_revision',String(row.evidence_revision));
    }
    if(row.lifecycle_status!=='VERIFIED')return {ok:false as const,error:'verification_required'};
  }
  return {ok:true as const,row,reason};
}

export async function publishProductMonitoring(env:Env,asin:string,form:FormData,actor:string){
  let row=await approvalWatch(env,asin);
  if(!row)return {ok:false as const,error:'not_found_or_unverified'};
  if(row.lifecycle_status==='PUBLISHED')return {ok:true as const};
  const input:ReviewInput={attemptId:Number(row.verification_attempt_id),evidenceRevision:String(row.evidence_revision),reason:String(form.get('reason')),
    lane:(String(form.get('lane')||'normal')) as 'normal'|'priority',routingKey:catalogRoute(row.watch_category) as ReviewInput['routingKey'],alertOnInitialBuyable:form.get('alert_on_initial_buyable')==='on'};
  if(row.lifecycle_status==='VERIFIED'){
    const approved=await reviewAmazonCandidate(env,asin,'approve',input,actor);if(!approved.ok)return approved;
  }else if(row.lifecycle_status!=='APPROVED')return {ok:false as const,error:'candidate_not_verified'};
  await env.SPAWN_DB.prepare("UPDATE amazon_watchlist SET poll_interval_minutes=? WHERE asin=? AND lifecycle_status='APPROVED' AND evidence_revision=?")
    .bind(Number(form.get('cadence')||60),asin,input.evidenceRevision).run();
  return reviewAmazonCandidate(env,asin,'publish',input,actor);
}
