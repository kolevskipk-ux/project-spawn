import type {Env} from './types';
import type {Operator} from './operations-auth';
import {operationsShell,esc} from './operations';
import {boardHeaders} from './board';

export async function storePilotOperations(request:Request,env:Env,operator:Operator){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const rows=(await env.SPAWN_DB.prepare(`SELECT s.retailer,t.title,t.url,t.state,t.last_observed_at,t.last_attempt_at,t.failures,t.next_due_at,o.evidence,
  CASE WHEN p.target_id IS NOT NULL THEN 1 ELSE 0 END pilot,
  (SELECT previous.observed_at FROM store_monitor_observations previous WHERE previous.target_id=t.id AND previous.state IN ('available','sold_out','preorder_placeholder') AND previous.observed_at>=p.enrolled_at ORDER BY previous.observed_at DESC LIMIT 1 OFFSET 1) previous_success
  FROM store_monitor_targets t JOIN store_acquisitions s ON s.id=t.store_id
  LEFT JOIN store_monitor_pilot p ON p.target_id=t.id
  LEFT JOIN store_monitor_observations o ON o.receipt_id=t.last_receipt
  WHERE p.target_id IS NOT NULL OR t.failures>=3
  ORDER BY pilot DESC,t.failures DESC,t.id LIMIT 200`).all<Record<string,unknown>>()).results;
 const pilots=rows.filter(r=>r.pilot===1),now=Date.now();
 const fresh=pilots.filter(r=>r.last_observed_at&&now-Date.parse(String(r.last_observed_at))<=12*60000).length;
 const table=rows.map(r=>`<tr><td>${r.pilot?'Pilot':'Review'}</td><td>${esc(r.retailer)}</td><td><a href="${esc(r.url)}" target="_blank" rel="noreferrer">${esc(r.title)}</a></td><td>${esc(r.state)}${r.failures?' (last known)':''}</td><td>${esc(r.last_observed_at||'Never')}</td><td>${esc(r.last_attempt_at||'Never')}</td><td>${r.previous_success&&r.last_observed_at?esc(((Date.parse(String(r.last_observed_at))-Date.parse(String(r.previous_success)))/60000).toFixed(1)):'Not measured'}</td><td>${esc(r.failures)}</td><td>${esc(r.evidence||'')}</td></tr>`).join('');
 const rejected=(await env.SPAWN_DB.prepare('SELECT event_id,reason,rejected_at FROM customer_event_rejections ORDER BY rejected_at DESC LIMIT 20').all<Record<string,unknown>>()).results;
 const body=`<section><h2>Reliable store pilot</h2><p>${env.STORE_MONITOR_PILOT_ENABLED==='true'?'Pilot mode':'Catalog mode'} · ${pilots.length} enrolled · ${fresh} fresh within 12 minutes · expires ${esc(env.STORE_MONITOR_PILOT_UNTIL||'Not configured')}.</p><p>The target is one successful reading every ten minutes during active hours. Errors retain the last good state and back off. A rate-limited pilot store is held for review. Expiry stops pilot acquisition; it never restores broad scanning automatically.</p></section><section><h2>Coverage and maintenance review</h2><p>Up to 200 pilot and repeatedly failing targets. A 404 is a retirement candidate, not an automatic deletion. Rate limits need slower acquisition; missing product evidence needs adapter review. Times are UTC. Successful revisit gaps are measured only after enrollment.</p><div class="ops-scroll"><table class="ops-table"><thead><tr>${['Lane','Store','Product','Last state','Last successful read','Last attempt','Revisit minutes','Failures','Latest evidence'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${table}</tbody></table></div></section><section><h2>Customer events needing review</h2><p>Rejected events stay stored and are excluded from delivery until repaired and reviewed.</p><pre>${esc(JSON.stringify(rejected,null,2))}</pre></section>`;
 return new Response(operationsShell('Store coverage',body,operator,env,'/ops/store-coverage'),{headers:{...boardHeaders(),'content-type':'text/html; charset=utf-8'}});
}
