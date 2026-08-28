import { catalogProductId } from "./catalog";
import type { Env, Listing } from "./types";

export interface VerificationCandidate {
  asin: string;
  product_name: string;
  product_url: string;
  watch_category: Listing["watch_category"];
  language: Listing["language"];
  evidence: string | null;
  lifecycle_status: string;
}

export interface VerificationAssessment {
  outcome: "VERIFIED" | "REVIEW_REQUIRED" | "REJECTED" | "ERROR";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  canonicalProductId: string | null;
  gateResults: Record<string, boolean>;
  unresolvedQuestions: string[];
  accessOutcome: string;
  observedAvailability: string;
}

const validRoleId=(value:string|undefined)=>/^\d{15,22}$/.test(value||"")?value:null;
export async function deliverApprovalRequest(env:Env, evidenceRevision:string, fetchFn:typeof fetch=fetch) {
  const row=await env.SPAWN_DB.prepare(`SELECT n.*,w.product_name,w.product_url,a.confidence,a.unresolved_questions
    FROM approval_notifications n JOIN amazon_watchlist w ON w.asin=n.asin JOIN amazon_verification_attempts a ON a.id=n.verification_attempt_id
    WHERE n.evidence_revision=? AND n.status!='DELIVERED'`).bind(evidenceRevision).first<Record<string,unknown>>();
  if(!row) return {ok:true as const,status:"already-delivered-or-missing"};
  const now=new Date().toISOString();
  if(!env.OPS_DISCORD_WEBHOOK_URL) {
    await env.SPAWN_DB.prepare("UPDATE approval_notifications SET status='PENDING_MISSING_ROUTE',attempts=attempts+1,last_attempt_at=?,last_error='OPS_DISCORD_WEBHOOK_URL_NOT_CONFIGURED' WHERE evidence_revision=?").bind(now,evidenceRevision).run();
    return {ok:false as const,status:"pending-missing-route"};
  }
  const role=validRoleId(env.APPROVAL_DISCORD_ROLE_ID), dashboard=`${env.PUBLIC_BASE_URL}/dashboard`;
  const content=[role?`<@&${role}>`:"🛡️ Admin support requested","🔎 **SPAWN — APPROVAL REVIEW REQUESTED**",`**${row.product_name}**`,`ASIN: **${row.asin}**`,`Verification confidence: **${row.confidence}**`,row.unresolved_questions?`Open questions: ${row.unresolved_questions}`:"All deterministic verification gates passed.",dashboard,"_Review evidence in the protected dashboard. This is not an availability alert._"].join("\n").slice(0,1900);
  try {
    const response=await fetchFn(env.OPS_DISCORD_WEBHOOK_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"Spawn Operations",content,allowed_mentions:{parse:[],roles:role?[role]:[]}})});
    if(!response.ok) throw new Error(`Discord ${response.status}`);
    await env.SPAWN_DB.prepare("UPDATE approval_notifications SET status='DELIVERED',attempts=attempts+1,last_attempt_at=?,delivered_at=?,last_error=NULL WHERE evidence_revision=?").bind(now,now,evidenceRevision).run();
    return {ok:true as const,status:"delivered"};
  } catch(error) {
    await env.SPAWN_DB.prepare("UPDATE approval_notifications SET status='PENDING',attempts=attempts+1,last_attempt_at=?,last_error=? WHERE evidence_revision=?").bind(now,String(error instanceof Error?error.message:error).slice(0,240),evidenceRevision).run();
    return {ok:false as const,status:"pending-delivery"};
  }
}

export async function retryApprovalRequests(env:Env,limit=10) {
  const rows=await env.SPAWN_DB.prepare("SELECT evidence_revision FROM approval_notifications WHERE status!='DELIVERED' ORDER BY COALESCE(last_attempt_at,created_at) ASC LIMIT ?").bind(limit).all<{evidence_revision:string}>();
  for(const row of rows.results) await deliverApprovalRequest(env,row.evidence_revision).catch(()=>undefined);
}

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function assessAmazonVerification(candidate: VerificationCandidate, response: { status: number; url: string; html: string; error?: string | null }): VerificationAssessment {
  let parsed: URL | null = null;
  try { parsed = new URL(response.url || candidate.product_url); } catch {}
  const html = fold(response.html || "");
  const expectedAsin = candidate.asin.toUpperCase();
  const canonicalProductId = catalogProductId({ title:candidate.product_name, watch_category:candidate.watch_category, language:candidate.language });
  const gates = {
    directAmazonMxUrl:Boolean(parsed && parsed.protocol === "https:" && parsed.hostname === "www.amazon.com.mx" && parsed.pathname.toUpperCase().includes(`/DP/${expectedAsin}`)),
    httpSuccess:response.status >= 200 && response.status < 300,
    amazonPage:html.includes("amazon"),
    expectedAsin:html.toUpperCase().includes(expectedAsin),
    notRobotBlocked:!/(robot check|captcha|automated access|introduce los caracteres)/i.test(response.html || ""),
    englishLanguage:candidate.language === "english",
    canonicalIdentity:Boolean(canonicalProductId)
  };
  const hardFailure = !gates.directAmazonMxUrl || (response.status >= 400 && response.status < 500 && response.status !== 429);
  const accessFailure = Boolean(response.error) || !gates.httpSuccess || !gates.notRobotBlocked || !gates.amazonPage || !gates.expectedAsin;
  const unresolved = Object.entries(gates).filter(([,passed]) => !passed).map(([name]) => name);
  const observedAvailability = /(currently unavailable|actualmente no disponible|no hay ofertas destacadas)/i.test(response.html || "") ? "sold_out"
    : /(add to cart|agregar al carrito|comprar ahora|pre-order|preventa)/i.test(response.html || "") ? "possible_buyable" : "unknown";
  if (hardFailure) return { outcome:"REJECTED", confidence:"HIGH", canonicalProductId, gateResults:gates, unresolvedQuestions:unresolved, accessOutcome:`HTTP_${response.status || 0}`, observedAvailability };
  if (accessFailure) return { outcome:response.error ? "ERROR" : "REVIEW_REQUIRED", confidence:"LOW", canonicalProductId, gateResults:gates, unresolvedQuestions:unresolved, accessOutcome:response.error ? "TRANSPORT_ERROR" : gates.notRobotBlocked ? `HTTP_${response.status}` : "ROBOT_BLOCKED", observedAvailability };
  if (!gates.englishLanguage || !gates.canonicalIdentity) return { outcome:"REVIEW_REQUIRED", confidence:"MEDIUM", canonicalProductId, gateResults:gates, unresolvedQuestions:unresolved, accessOutcome:"VALID_PAGE", observedAvailability };
  return { outcome:"VERIFIED", confidence:"HIGH", canonicalProductId, gateResults:gates, unresolvedQuestions:[], accessOutcome:"VALID_PAGE", observedAvailability };
}

export async function runAmazonVerification(env: Env, asin: string, actor: string, fetchFn: typeof fetch = fetch) {
  const candidate = await env.SPAWN_DB.prepare(`SELECT asin,product_name,product_url,watch_category,language,evidence,lifecycle_status
    FROM amazon_watchlist WHERE asin=? AND lifecycle_status!='PUBLISHED'`).bind(asin).first<VerificationCandidate>();
  if (!candidate) return { ok:false as const, error:"not_found_or_published" };
  const started = new Date(), evidenceRevision = crypto.randomUUID();
  let status = 0, responseUrl = candidate.product_url, responseHtml = "", transportError: string | null = null;
  try {
    const response = await fetchFn(candidate.product_url, { headers:{ "User-Agent":"Mozilla/5.0 (compatible; ProjectGarfield-Verification/1.0)", Accept:"text/html,application/xhtml+xml", "Accept-Language":"en-US,en;q=0.9,es-MX;q=0.7" }, redirect:"follow" });
    status = response.status; responseUrl = response.url || candidate.product_url; responseHtml = (await response.text()).slice(0, 2_000_000);
  } catch (error) { transportError = String(error instanceof Error ? error.message : error).slice(0,240); }
  const assessment = assessAmazonVerification(candidate, { status, url:responseUrl, html:responseHtml, error:transportError });
  const completed = new Date().toISOString();
  const evidence = { source_evidence:candidate.evidence, response_url:responseUrl, html_bytes:responseHtml.length, title:responseHtml.match(/<title[^>]*>([^<]{0,500})<\/title>/i)?.[1] ?? null, transport_error:transportError };
  const insert = await env.SPAWN_DB.prepare(`INSERT INTO amazon_verification_attempts
    (asin,evidence_revision,started_at,completed_at,outcome,method,access_outcome,http_status,product_url,canonical_product_id,product_name,watch_category,language,retailer,retailer_identifier,observed_price_mxn,observed_availability,evidence_json,gate_results_json,confidence,unresolved_questions,proposed_lane,proposed_routing_key,proposed_alert_on_initial_buyable,created_by)
    VALUES(?,?,?,?,?,'plain_fetch',?,?,?,?,?,?,?,'Amazon México',?,NULL,?,?,?,?,?,?,?,0,?)`)
    .bind(candidate.asin,evidenceRevision,started.toISOString(),completed,assessment.outcome,assessment.accessOutcome,status||null,responseUrl,assessment.canonicalProductId,candidate.product_name,candidate.watch_category,candidate.language,candidate.asin,assessment.observedAvailability,JSON.stringify(evidence),JSON.stringify(assessment.gateResults),assessment.confidence,assessment.unresolvedQuestions.join(", ")||null,"normal",candidate.watch_category==="delta_reign"?"delta-reign":candidate.watch_category==="mtg_hobbit_collector_box"?"magic-hobbit":"pokemon-main",actor).run();
  const attemptId = Number(insert.meta.last_row_id);
  await env.SPAWN_DB.prepare(`UPDATE amazon_watchlist SET lifecycle_status=?,verification_attempt_id=?,evidence_revision=?,verified_at=?,updated_at=? WHERE asin=? AND lifecycle_status!='PUBLISHED'`)
    .bind(assessment.outcome==="VERIFIED"?"VERIFIED":assessment.outcome==="REJECTED"?"REJECTED":"DISCOVERED",attemptId,evidenceRevision,assessment.outcome==="VERIFIED"?completed:null,completed,candidate.asin).run();
  if(assessment.outcome==="VERIFIED") {
    await env.SPAWN_DB.prepare("INSERT OR IGNORE INTO approval_notifications(evidence_revision,asin,verification_attempt_id,status,created_at) VALUES(?,?,?,'PENDING',?)").bind(evidenceRevision,candidate.asin,attemptId,completed).run();
    await deliverApprovalRequest(env,evidenceRevision,fetchFn).catch(()=>undefined);
  }
  return { ok:true as const, asin:candidate.asin, attemptId, evidenceRevision, assessment };
}

export type ReviewAction = "approve" | "reject" | "publish";
export interface ReviewInput {
  attemptId: number;
  evidenceRevision: string;
  reason: string;
  lane?: "priority" | "normal";
  routingKey?: "pokemon-main" | "delta-reign" | "magic-hobbit";
  alertOnInitialBuyable?: boolean;
}

export async function reviewAmazonCandidate(env: Env, asin: string, action: ReviewAction, input: ReviewInput, actor: string) {
  const reason=input.reason.trim().slice(0,500);
  if (!reason) return {ok:false as const,error:"reason_required"};
  const row=await env.SPAWN_DB.prepare(`SELECT w.*,a.outcome attempt_outcome,a.canonical_product_id verified_product_id,a.language verified_language
    FROM amazon_watchlist w JOIN amazon_verification_attempts a ON a.id=w.verification_attempt_id
    WHERE w.asin=?`).bind(asin).first<Record<string,unknown>>();
  if (!row) return {ok:false as const,error:"not_found_or_unverified"};
  if (Number(row.verification_attempt_id)!==input.attemptId || row.evidence_revision!==input.evidenceRevision)
    return {ok:false as const,error:"stale_evidence"};
  const now=new Date().toISOString();
  if (action==="reject") {
    if (row.lifecycle_status==="PUBLISHED") return {ok:false as const,error:"published_requires_separate_suspension"};
    await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare("UPDATE amazon_watchlist SET lifecycle_status='REJECTED',updated_at=? WHERE asin=? AND evidence_revision=?").bind(now,asin,input.evidenceRevision),
      env.SPAWN_DB.prepare("INSERT INTO amazon_catalog_decisions(asin,verification_attempt_id,evidence_revision,decision,reason,decided_by,decided_at) VALUES(?,?,?,'REJECTED',?,?,?)").bind(asin,input.attemptId,input.evidenceRevision,reason,actor,now)
    ]);
    return {ok:true as const,asin,lifecycleStatus:"REJECTED",catalogVersion:null};
  }
  if (action==="approve") {
    if (row.lifecycle_status!=="VERIFIED" || row.attempt_outcome!=="VERIFIED") return {ok:false as const,error:"candidate_not_verified"};
    if (!row.verified_product_id || row.verified_language!=="english" || !input.lane || !input.routingKey) return {ok:false as const,error:"incomplete_approval"};
    await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare(`UPDATE amazon_watchlist SET lifecycle_status='APPROVED',canonical_product_id=?,language='english',lane=?,routing_key=?,alert_on_initial_buyable=?,approved_by=?,approval_reason=?,approved_at=?,updated_at=? WHERE asin=? AND lifecycle_status='VERIFIED' AND evidence_revision=?`)
        .bind(row.verified_product_id,input.lane,input.routingKey,Number(Boolean(input.alertOnInitialBuyable)),actor,reason,now,now,asin,input.evidenceRevision),
      env.SPAWN_DB.prepare("INSERT INTO amazon_catalog_decisions(asin,verification_attempt_id,evidence_revision,decision,reason,decided_by,decided_at) VALUES(?,?,?,'APPROVED',?,?,?)").bind(asin,input.attemptId,input.evidenceRevision,reason,actor,now)
    ]);
    return {ok:true as const,asin,lifecycleStatus:"APPROVED",catalogVersion:null};
  }
  if (row.lifecycle_status!=="APPROVED") return {ok:false as const,error:"candidate_not_approved"};
  await env.SPAWN_DB.batch([
    env.SPAWN_DB.prepare("UPDATE amazon_watchlist SET lifecycle_status='PUBLISHED',updated_at=? WHERE asin=? AND lifecycle_status='APPROVED' AND evidence_revision=?").bind(now,asin,input.evidenceRevision),
    env.SPAWN_DB.prepare("INSERT INTO worker_state(key,value,updated_at) VALUES('amazon_catalog_version','1',?) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(worker_state.value AS INTEGER)+1 AS TEXT),updated_at=excluded.updated_at").bind(now),
    env.SPAWN_DB.prepare("INSERT INTO amazon_catalog_decisions(asin,verification_attempt_id,evidence_revision,decision,reason,decided_by,decided_at) VALUES(?,?,?,'PUBLISHED',?,?,?)").bind(asin,input.attemptId,input.evidenceRevision,reason,actor,now)
  ]);
  const versionRow=await env.SPAWN_DB.prepare("SELECT value FROM worker_state WHERE key='amazon_catalog_version'").first<{value:string}>(), nextVersion=versionRow?.value??"0";
  await env.SPAWN_DB.prepare("UPDATE amazon_catalog_decisions SET resulting_catalog_version=? WHERE asin=? AND verification_attempt_id=? AND decision='PUBLISHED' AND decided_at=?").bind(nextVersion,asin,input.attemptId,now).run();
  return {ok:true as const,asin,lifecycleStatus:"PUBLISHED",catalogVersion:nextVersion};
}
