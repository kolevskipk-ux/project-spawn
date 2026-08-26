import type { Env } from "./types";

export async function dashboardData(env: Env) {
  const [lastSuccess,recent,inventory,vendors,candidates,feedback] = await Promise.all([
    env.SPAWN_DB.prepare("SELECT value,updated_at FROM worker_state WHERE key='last_success'").first(),
    env.SPAWN_DB.prepare("SELECT started_at,finished_at,status,error FROM scan_runs ORDER BY started_at DESC LIMIT 8").all(),
    env.SPAWN_DB.prepare("SELECT COUNT(*) total,SUM(status='available') available,SUM(status='unknown') unknown,SUM(availability_state='preorder_placeholder') placeholders,MAX(last_seen_at) freshest FROM inventory").first(),
    env.SPAWN_DB.prepare("SELECT status,COUNT(*) count FROM vendors GROUP BY status").all(),
    env.SPAWN_DB.prepare("SELECT status,print_series,COUNT(*) count FROM monitoring_candidates GROUP BY status,print_series").all(),
    env.SPAWN_DB.prepare("SELECT week_key,COUNT(*) responses,ROUND(AVG(usefulness),1) usefulness,SUM(successful_purchase) purchases FROM weekly_feedback_responses GROUP BY week_key ORDER BY week_key DESC LIMIT 8").all()
  ]);
  let catchHealth:unknown=null;
  if(env.CATCH_MONITOR_ENDPOINT) try { const response=await fetch(env.CATCH_MONITOR_ENDPOINT,{headers:{accept:"application/json"}}); catchHealth=response.ok?await response.json():{ok:false,status:response.status}; } catch { catchHealth={ok:false,error:"unreachable"}; }
  return {generated_at:new Date().toISOString(),spawn:{last_success:lastSuccess,recent_runs:recent.results,inventory},vendors:vendors.results,discovery_ingestion:candidates.results,weekly_feedback:feedback.results,catch_em_all:catchHealth};
}

const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export function renderDashboard(data:Awaited<ReturnType<typeof dashboardData>>, token:string) {
  const sections=[
    ["Spawn health",data.spawn],["Catch Em All health",data.catch_em_all??"CATCH_MONITOR_ENDPOINT not configured"],
    ["Vendor suppressions",data.vendors],["Discovery → ingestion",data.discovery_ingestion],["Weekly feedback trends",data.weekly_feedback]
  ];
  return `<!doctype html><meta name="viewport" content="width=device-width"><title>Garfield operations</title><style>body{font:15px system-ui;background:#101114;color:#eef1e8;max-width:76rem;margin:auto;padding:2rem}header{display:flex;justify-content:space-between;align-items:end}a{color:#c9f65a}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}section{background:#191c17;border:1px solid #30352b;border-radius:14px;padding:1rem;overflow:auto}pre{white-space:pre-wrap;color:#bdc5b3}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style><header><div><p>Project Garfield</p><h1>Operations dashboard</h1><p>Generated on request; no background dashboard polling.</p></div><p><a href="/inventory?access=${encodeURIComponent(token)}">Inventory</a> · <a href="/inventory.csv?access=${encodeURIComponent(token)}">CSV</a></p></header><main class="grid">${sections.map(([title,value])=>`<section><h2>${esc(title)}</h2><pre>${esc(JSON.stringify(value,null,2))}</pre></section>`).join("")}</main>`;
}
