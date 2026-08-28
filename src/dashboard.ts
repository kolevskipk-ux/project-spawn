import type { Env } from "./types";

export async function dashboardData(env: Env) {
  const [lastSuccess,recent,inventory,vendors,candidates,feedback,verificationQueue,catalogVersion] = await Promise.all([
    env.SPAWN_DB.prepare("SELECT value,updated_at FROM worker_state WHERE key='last_success'").first(),
    env.SPAWN_DB.prepare("SELECT started_at,finished_at,status,error FROM scan_runs ORDER BY started_at DESC LIMIT 8").all(),
    env.SPAWN_DB.prepare("SELECT COUNT(*) total,SUM(status='available') available,SUM(status='unknown') unknown,SUM(availability_state='preorder_placeholder') placeholders,MAX(last_seen_at) freshest FROM inventory").first(),
    env.SPAWN_DB.prepare("SELECT status,COUNT(*) count FROM vendors GROUP BY status").all(),
    env.SPAWN_DB.prepare("SELECT status,print_series,COUNT(*) count FROM monitoring_candidates GROUP BY status,print_series").all(),
    env.SPAWN_DB.prepare("SELECT week_key,COUNT(*) responses,ROUND(AVG(usefulness),1) usefulness,SUM(successful_purchase) purchases FROM weekly_feedback_responses GROUP BY week_key ORDER BY week_key DESC LIMIT 8").all(),
    env.SPAWN_DB.prepare(`SELECT w.asin,w.product_name,w.product_url,w.watch_category,w.language,w.lifecycle_status,w.first_discovered_at,w.last_discovered_at,w.verification_attempt_id,w.evidence_revision,w.lane,w.routing_key,w.alert_on_initial_buyable,
      a.completed_at verification_completed_at,a.outcome verification_outcome,a.access_outcome,a.http_status,a.canonical_product_id,a.observed_availability,a.gate_results_json,a.confidence,a.unresolved_questions,n.status approval_notice_status,n.attempts approval_notice_attempts,n.last_error approval_notice_error,
      (SELECT json_group_array(json_object('decision',d.decision,'reason',d.reason,'actor',d.actor,'decided_at',d.decided_at,'catalog_version',d.catalog_version)) FROM amazon_catalog_decisions d WHERE d.asin=w.asin) decision_history
      FROM amazon_watchlist w LEFT JOIN amazon_verification_attempts a ON a.id=w.verification_attempt_id LEFT JOIN approval_notifications n ON n.evidence_revision=w.evidence_revision
      WHERE w.lifecycle_status!='PUBLISHED' ORDER BY w.first_discovered_at ASC LIMIT 200`).all(),
    env.SPAWN_DB.prepare("SELECT value,updated_at FROM worker_state WHERE key='amazon_catalog_version'").first()
  ]);
  let catchHealth:unknown=null;
  if(env.CATCH_MONITOR_ENDPOINT) try { const response=await fetch(env.CATCH_MONITOR_ENDPOINT,{headers:{accept:"application/json"}}); catchHealth=response.ok?await response.json():{ok:false,status:response.status}; } catch { catchHealth={ok:false,error:"unreachable"}; }
  return {generated_at:new Date().toISOString(),spawn:{last_success:lastSuccess,recent_runs:recent.results,inventory},vendors:vendors.results,discovery_ingestion:candidates.results,weekly_feedback:feedback.results,verification_queue:verificationQueue.results,catalog_version:catalogVersion,catch_em_all:catchHealth};
}

const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export function renderDashboard(data:Awaited<ReturnType<typeof dashboardData>>, token:string) {
  const sections=[
    ["Spawn health",data.spawn],["Catch Em All health",data.catch_em_all??"CATCH_MONITOR_ENDPOINT not configured"],
    ["Vendor suppressions",data.vendors],["Discovery → ingestion",data.discovery_ingestion],["Weekly feedback trends",data.weekly_feedback]
  ];
  const queue=(data.verification_queue as Array<Record<string,unknown>>).map(row=>{
    const action=`/dashboard/verification/${esc(row.asin)}?access=${encodeURIComponent(token)}`;
    const hidden=`<input type="hidden" name="attempt_id" value="${esc(row.verification_attempt_id)}"><input type="hidden" name="evidence_revision" value="${esc(row.evidence_revision)}">`;
    return `<article><h3>${esc(row.product_name)}</h3><p><b>${esc(row.lifecycle_status)}</b> · ${esc(row.asin)} · queued ${esc(row.first_discovered_at)}</p><p>Admin request: <b>${esc(row.approval_notice_status??"not requested")}</b>${row.approval_notice_error?` · ${esc(row.approval_notice_error)}`:""}</p><p><a href="${esc(row.product_url)}" rel="noreferrer">Direct Amazon listing</a></p><details><summary>Latest independent verification</summary><pre>${esc(JSON.stringify({completed_at:row.verification_completed_at,outcome:row.verification_outcome,access:row.access_outcome,http:row.http_status,canonical_product_id:row.canonical_product_id,availability:row.observed_availability,confidence:row.confidence,gates:row.gate_results_json,unresolved:row.unresolved_questions},null,2))}</pre></details>
      <form method="post" action="${action}"><button name="action" value="verify">Run fresh verification</button></form>
      ${row.verification_attempt_id?`<form method="post" action="${action}">${hidden}<label>Reason <input name="reason" maxlength="500" required></label><label>Lane <select name="lane"><option value="normal">normal</option><option value="priority">priority</option></select></label><label>Route <select name="routing_key"><option>pokemon-main</option><option>delta-reign</option><option>magic-hobbit</option></select></label><label><input type="checkbox" name="alert_on_initial_buyable"> Alert on initial buyable</label><button name="action" value="approve">Approve</button><button name="action" value="reject">Reject</button>${row.lifecycle_status==="APPROVED"?`<button name="action" value="publish">Publish to Catch</button>`:""}</form>`:""}
      <details><summary>Decision history</summary><pre>${esc(row.decision_history)}</pre></details></article>`;
  }).join("")||"<p>No candidates awaiting review.</p>";
  return `<!doctype html><meta name="viewport" content="width=device-width"><title>Garfield operations</title><style>body{font:15px system-ui;background:#101114;color:#eef1e8;max-width:76rem;margin:auto;padding:2rem}header{display:flex;justify-content:space-between;align-items:end}a{color:#c9f65a}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}section,article{background:#191c17;border:1px solid #30352b;border-radius:14px;padding:1rem;overflow:auto}article{margin:.75rem 0;background:#131510}form{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin:.7rem 0}button,input,select{font:inherit;padding:.45rem}pre{white-space:pre-wrap;color:#bdc5b3}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style><header><div><p>Project Garfield</p><h1>Operations dashboard</h1><p>Operator approval queue · Catalog version ${esc((data.catalog_version as {value?:string}|null)?.value??"0")}</p></div><p><a href="/inventory?access=${encodeURIComponent(token)}">Inventory</a> · <a href="/inventory.csv?access=${encodeURIComponent(token)}">CSV</a></p></header><section><h2>Amazon verification queue</h2><p>Verification records evidence only. Approval and publication are separate operator decisions.</p>${queue}</section><main class="grid">${sections.map(([title,value])=>`<section><h2>${esc(title)}</h2><pre>${esc(JSON.stringify(value,null,2))}</pre></section>`).join("")}</main>`;
}
