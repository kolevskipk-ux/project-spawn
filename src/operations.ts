import {customerOperations} from './customer-operations';
import {customerSupportOperations} from './customer-support-operations';
import type {Env} from './types';
import {boardHeaders} from './board';
import type {Operator} from './operations-auth';
import {searchAccountingData,searchMonth,SEARCH_BUDGET_MICROUSD,SEARCH_RESERVE_MICROUSD} from './search-accounting';
import {searchAuditDetail} from './search-audit';
import {trustedStoreOperations} from './trusted-store-operations';
import {storeCatalogOperations} from './store-catalog-operations';
import {approvedInventoryOperations} from './approved-inventory-operations';

export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const css = `
:root{color-scheme:dark;--surface:#181c23;--line:#303743;--muted:#abb6c7;--accent:#c9f65a}
*{box-sizing:border-box}body{margin:0!important;max-width:none!important;padding:0!important;background:#0e1117!important;color:#edf1f7;font:16px/1.55 system-ui!important}a{color:var(--accent)}button,input,select,textarea{font:inherit}button,a,input,select,textarea{touch-action:manipulation}button{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.skip{position:absolute;left:-9999px}.skip:focus{left:1rem;top:1rem;z-index:9;background:#111;padding:1rem}
.ops-sidebar{position:fixed;inset:0 auto 0 0;width:15rem;padding:1.75rem 1rem;background:#141820;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:2rem}.ops-brand{font-weight:800;font-size:1.3rem;letter-spacing:.12em;color:#f5f7fa;text-decoration:none}.ops-brand small{display:block;color:var(--muted);font-size:.875rem;font-weight:400;letter-spacing:0}.ops-nav{display:grid;gap:.35rem}.ops-nav a{padding:.65rem .9rem;border-radius:.45rem;color:var(--muted);text-decoration:none}.ops-nav a[aria-current=page]{background:#273123;color:var(--accent);font-weight:650;border-left:3px solid var(--accent)}.ops-account{margin-top:auto;font-size:.875rem;overflow-wrap:anywhere}.ops-account strong{display:block;color:#f5f7fa}.ops-account a{display:inline-block;margin-top:.75rem}
.ops-workspace{margin-left:15rem}.ops-topbar{padding:1.25rem 2rem;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:1rem}.ops-topbar h1{font-size:1.5rem;margin:0}.ops-env{font-size:.875rem;background:#302a1a;border:1px solid #685a30;color:#ffe49a;padding:.2rem .65rem;border-radius:2rem}.ops-content{padding:1.75rem 2rem;max-width:100rem}.ops-content>section,.ops-panel{margin-bottom:1.25rem;padding:1.35rem;border:1px solid var(--line);background:var(--surface);border-radius:.65rem}.ops-content h2{font-size:1.15rem;margin-top:0}.ops-muted,.ops-content .hint{color:var(--muted);font-size:.875rem}.ops-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin-bottom:1.5rem}.ops-metric{padding:1.25rem;background:var(--surface);border:1px solid var(--line);border-radius:.65rem}.ops-metric strong{display:block;font-size:2rem;line-height:1.3}.ops-metric span{font-size:.875rem;color:var(--muted)}.ops-primary{display:inline-block;border:0;background:var(--accent);color:#17200d!important;padding:.65rem 1rem;border-radius:.4rem;font-weight:700;text-decoration:none}.ops-table{width:100%;border-collapse:collapse}.ops-table th,.ops-table td{text-align:left;padding:.8rem;border-bottom:1px solid var(--line);vertical-align:top;white-space:normal}.ops-table th{color:var(--muted);font-size:.875rem}.ops-scroll{overflow:auto}.ops-form{display:flex;flex-wrap:wrap;gap:1rem;align-items:end}.ops-form label{display:grid;gap:.35rem;font-size:.875rem}.ops-form input,.ops-form select,.ops-form textarea{padding:.6rem;background:#0e1117;color:#eef1f7;border:1px solid #566174;border-radius:.35rem}.ops-form textarea{min-width:18rem}.ops-form button{padding:.65rem 1rem}.ops-content pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.ops-content section,.ops-content article{max-width:100%}.ops-content .eyebrow,.ops-content .hint,.ops-content .evidence-summary span,.ops-content .actions span{font-size:.875rem}.ops-content form{font-size:1rem}.ops-content main{padding:0;max-width:none;margin:0}.ops-content .card-head{flex-wrap:wrap}.ops-content .approval-card{border-color:var(--line);background:#141820}.ops-content fieldset{min-width:0}.ops-content .approval-summary{margin-top:0}.ops-content textarea{max-width:100%}.ops-alert{border-left:3px solid #ffe49a;padding:1rem;background:#302a1a;margin-bottom:1rem}.ops-empty{padding:1rem 0;color:var(--muted)}
@media(max-width:900px){.ops-sidebar{position:static;width:auto;gap:1rem;padding:1rem}.ops-nav{display:flex;overflow:auto}.ops-nav a{white-space:nowrap}.ops-account{display:none}.ops-workspace{margin-left:0}.ops-topbar,.ops-content{padding:1rem}.ops-metrics{grid-template-columns:1fr 1fr}.ops-topbar{flex-wrap:wrap}}
@media(max-width:540px){.ops-metrics{grid-template-columns:1fr}.ops-form{display:grid}.ops-form textarea{min-width:0}.ops-topbar h1{font-size:1.3rem}}`;

export function operationsShell(title: string, content: string, operator: Operator, env: Env, path: string, styles = ''): string {
  const links = [['/ops','Overview'],['/approvals','Approved inventory'],['/inventory','Inventory'],['/ops/vendors','Vendors'],['/ops/stores','Store acquisition'],['/ops/trusted-stores','Trusted stores'],['/ops/search','Search & budget'],['/ops/health','System health'],['/ops/activity','Activity'],...(operator.role === 'owner' ? [['/ops/people','People & roles']] : []),...(env.CUSTOMER_DB && operator.role!=='viewer' ? [['/ops/customers','Customers'],['/ops/customer-support','Customer support']] : []),['/ops/account','My account']];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Garfield</title><meta name="robots" content="noindex,nofollow">${styles}<style>${css}</style></head><body><a class="skip" href="#workspace">Skip to content</a><aside class="ops-sidebar"><a class="ops-brand" href="/ops">GARFIELD<small>Operations</small></a><nav class="ops-nav" aria-label="Main navigation">${links.map(([href,label]) => `<a href="${href}"${path===href?' aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="ops-account"><strong>${esc(operator.email)}</strong>${esc(operator.role)}<br><a href="/cdn-cgi/access/logout">Sign out</a></div></aside><div class="ops-workspace"><header class="ops-topbar"><h1>${esc(title)}</h1><span class="ops-env">${esc(env.OPS_ENVIRONMENT ?? 'Environment not configured')}</span></header><main id="workspace" class="ops-content">${operator.role==='viewer'?'<p class="ops-alert">Read-only access. An administrator handles approval decisions.</p>':''}${content}</main></div></body></html>`;
}

export function wrapExistingPage(html: string, operator: Operator, env: Env, path: string): string {
  const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map(m => m[0]).join('');
  let content = html.includes('<body') ? html.replace(/^[\s\S]*?<body[^>]*>/i,'').replace(/<\/body>[\s\S]*$/i,'') : html.replace(/^[\s\S]*?<\/style>/i,'');
  content = content.replace(/^\s*<header[\s\S]*?<\/header>/i,'');
  // Clean empty legacy access parameters only in navigation/form URLs. Applying
  // this to the whole document also removes JavaScript ternary operators.
  content = content.replace(/\b(href|action)=(['"])([^'"]*)\2/gi,(_match,attribute,quote,value)=>
    `${attribute}=${quote}${value.replace(/\?access=(?=&|$)/g,'?').replace(/\?(?:&amp;|&)/g,'?').replace(/\?$/,'')}${quote}`);
  if (operator.role === 'viewer') content = content.replace(/<form\b[\s\S]*?<\/form>/gi,'<p class="ops-muted">Administrator access is required to take action.</p>').replace(/<script\b[\s\S]*?<\/script>/gi, path==='/inventory' ? '$&' : '');
  return operationsShell(path==='/approvals'?'Approvals':path==='/inventory'?'Inventory':'Detailed diagnostics',content,operator,env,path,styles);
}

const table = (headings: string[], rows: unknown[][], empty: string) => rows.length ? `<div class="ops-scroll"><table class="ops-table"><thead><tr>${headings.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="ops-empty">${esc(empty)}</p>`;
export function operationsHeaders(): Headers {
  const headers = new Headers(boardHeaders());
  // Native form POSTs need their Origin for CSRF validation. The legacy
  // shared-token board keeps no-referrer; individual-access pages have no token URLs.
  headers.set('referrer-policy', 'same-origin');
  return headers;
}
const response = (body: string, status=200) => new Response(body,{status,headers:operationsHeaders()});
export function operationsError(message: string, status: number, operator: Operator, env: Env): Response {
  return response(operationsShell('Action not completed',`<section><p>${esc(message)}</p><a href="/approvals">Return to approvals</a></section>`,operator,env,''),status);
}

async function searchAuditOperations(request:Request,env:Env,operator:Operator):Promise<Response> {
  if(request.method!=='GET')return operationsError('Search audit records are read-only.',405,operator,env);
  const url=new URL(request.url),scanId=url.searchParams.get('scan_id');
  let content='<p><a href="/ops/search">Back to search budget</a></p><p>Search sources are reported by the API. They do not prove retailer access or stock availability. Historical searches before audit activation have no reconstructed trail.</p>';
  if(scanId) {
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(scanId))return operationsError('Invalid scan identifier.',400,operator,env);
    const data=await searchAuditDetail(env,scanId);
    if(!data.events.length&&!data.scan)return operationsError('Search not found.',404,operator,env);
    if(url.searchParams.get('format')==='json')return new Response(JSON.stringify(data,null,2),{headers:{...operationsHeaders(),'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="search-${scanId}.json"`}});
    content+=`<section><h2>Search ${esc(scanId)}</h2><p><a href="/ops/search/audit?scan_id=${encodeURIComponent(scanId)}&amp;format=json">Download audit JSON</a></p><h3>Recorded outcome and usage</h3><pre>${esc(JSON.stringify({scan:data.scan,accounting:data.accounting,observations:data.observations},null,2))}</pre></section>`;
    content+=data.events.map(event=>`<section><h2>${esc(event.event_type)}</h2><p>${esc(event.occurred_at)} · event ${esc(event.id)}</p>${event.truncated?'<p class="ops-alert">Evidence exceeded the storage limit. Only a prefix was retained; the hash covers the original serialized evidence.</p>':''}<pre>${esc(JSON.stringify(JSON.parse(String(event.details_json)),null,2))}</pre><p class="ops-muted">SHA-256: ${esc(event.details_sha256)}</p></section>`).join('');
    if(!data.events.length)content+='<p>No audit events were retained for this historical scan.</p>';
  } else {
    const cursor=url.searchParams.get('before')??String(Number.MAX_SAFE_INTEGER);
    if(!/^\d+$/.test(cursor)||!Number.isSafeInteger(Number(cursor)))return operationsError('Invalid audit page.',400,operator,env);
    const rows=await env.SPAWN_DB.prepare(`SELECT scan_id,MIN(id) first_event,MIN(occurred_at) started_at,COUNT(*) events
      FROM search_audit_events GROUP BY scan_id HAVING MIN(id) < ? ORDER BY MIN(id) DESC LIMIT 50`).bind(Number(cursor)).all<{scan_id:string;first_event:number;started_at:string;events:number}>();
    content+=`<section><h2>Search attempts</h2><p>Includes budget skips, lock conflicts and failures before a scan result exists. Records are append-only and have no automatic expiry.</p><ul>${rows.results.map(row=>`<li><a href="/ops/search/audit?scan_id=${encodeURIComponent(row.scan_id)}">${esc(row.started_at)} · ${esc(row.scan_id)}</a> · ${esc(row.events)} events</li>`).join('')}</ul>${!rows.results.length?'<p>No search audit records yet.</p>':''}${rows.results.length===50?`<a href="/ops/search/audit?before=${rows.results[49].first_event}">Older searches →</a>`:''}</section>`;
  }
  return response(operationsShell('Search audit trail',content,operator,env,'/ops/search'));
}

async function searchOperations(request:Request,env:Env,operator:Operator):Promise<Response> {
  const now=new Date(),month=searchMonth(now,env.SPAWN_TIMEZONE);
  if(request.method==='POST') {
    if(operator.role!=='owner')return operationsError('Only the owner can reconcile search spend or record a search review.',403,operator,env);
    const form=await request.formData(),action=String(form.get('action')??''),reason=String(form.get('reason')??'').trim();
    if(!reason||reason.length>500)return operationsError('Enter a review note of up to 500 characters.',400,operator,env);
    if(action==='opening_balance') {
      const raw=String(form.get('opening_usd')??''),microusd=Math.round(Number(raw)*1_000_000);
      if(String(form.get('month'))!==month || !/^\d{1,6}(\.\d{1,6})?$/.test(raw)||!Number.isSafeInteger(microusd))return operationsError('Enter the current month and its verified opening search spend in USD.',400,operator,env);
      const result=await env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO search_budget_months(month,opening_microusd,recorded_at,recorded_by,reason) VALUES(?,?,?,?,?)`)
        .bind(month,microusd,now.toISOString(),operator.email,reason).run();
      if(!result.meta.changes)return operationsError('This month already has an opening balance. Reconcile corrections with the operator; this form cannot overwrite it.',409,operator,env);
    } else if(action==='review') {
      const result=await env.SPAWN_DB.prepare('UPDATE search_reviews SET reviewed_at=?,reviewed_by=?,note=? WHERE scan_id=? AND reviewed_at IS NULL')
        .bind(now.toISOString(),operator.email,reason,String(form.get('scan_id')??'')).run();
      if(!result.meta.changes)return operationsError('This review is no longer pending. Refresh the page.',409,operator,env);
    } else return operationsError('Unknown search action.',400,operator,env);
    return new Response(null,{status:303,headers:{location:'/ops/search','cache-control':'no-store'}});
  }
  if(request.method!=='GET')return operationsError('This action is not supported.',405,operator,env);
  const data=await searchAccountingData(env,now);
  const money=(value:unknown)=>value==null?'Unknown':`$${(Number(value)/1_000_000).toFixed(2)}`;
  const committed=(data.budget?.opening_microusd??0)+(data.totals?.estimated??0)+(data.totals?.held??0);
  const alerts=data.reviews.map(r=>`<section class="ops-alert"><h2>Search strategy review due</h2><p>${esc(r.consecutive_empty)} consecutive completed scans found no new listing URLs. Triggered ${esc(r.triggered_at)}. This review stays pending even if later scans discover listings.</p>${operator.role==='owner'?`<form method="post" class="ops-form"><input type="hidden" name="action" value="review"><input type="hidden" name="scan_id" value="${esc(r.scan_id)}"><label>Decision and next steps<textarea name="reason" required maxlength="500"></textarea></label><button>Record review</button></form>`:''}</section>`).join('');
  const opening=!data.budget?`<section class="ops-alert"><h2>Opening spend required</h2><p>Paid scans are blocked until this month’s pre-tracking Spawn API spend is reconciled. Historical scan records contain no billing usage. Include model and web-search charges through activation; do not enter zero unless verified.</p>${operator.role==='owner'?`<form method="post" class="ops-form"><input type="hidden" name="action" value="opening_balance"><input type="hidden" name="month" value="${esc(month)}"><label>Opening spend (USD)<input name="opening_usd" type="number" min="0" max="999999" step="0.000001" required></label><label>Billing evidence and cutoff<textarea name="reason" maxlength="500" required></textarea></label><button>Save opening balance</button></form>`:''}</section>`:'';
  const content=`<p><a href="/ops/search/audit">Browse search audit trail →</a></p>${alerts}${opening}<div class="ops-metrics"><div class="ops-metric"><span>${esc(month)} budget · USD</span><strong>${money(SEARCH_BUDGET_MICROUSD)}</strong><span>Calendar month in ${esc(env.SPAWN_TIMEZONE??'America/Mexico_City')}</span></div><div class="ops-metric"><span>Opening + estimated charges + held reserves</span><strong>${data.budget?money(committed):'Unreconciled'}</strong><span>Opening ${money(data.budget?.opening_microusd)} · estimated ${money(data.totals?.estimated)} · held ${money(data.totals?.held)}</span></div><div class="ops-metric"><span>Consecutive completed scans without new listings</span><strong>${esc(data.streak)} / 100</strong><span>A new listing resets this counter. Failures do not count.</span></div></div><section><h2>Discovery yield</h2><p>${esc(data.totals?.new_listings??0)} new listing URLs from ${esc(data.totals?.requests??0)} reserved scan requests this month. New means a previously unseen canonical listing URL, including unavailable products. Discovery does not mean approval or Catch enrollment.</p><p>Restocks and preorder openings are separate. Baseline initialization and pre-tracking scans are excluded from the consecutive counter. A review does not change the search strategy automatically.</p></section><section><h2>Budget guard</h2><p>Every paid scan reserves ${money(SEARCH_RESERVE_MICROUSD)} before calling the API. If there is insufficient room, the scan is skipped. Known usage replaces the reserve with an estimate; timeouts or missing usage retain the reserve. An estimate above its reserve blocks further paid scans for reconciliation.</p><p>These are application cost estimates, not an OpenAI invoice or an account-wide billing cap. They include model tokens and web-search calls; Catch and hosting costs are separate. The budget resets monthly; the consecutive counter does not.</p></section><section><h2>Latest 50 scans</h2>${table(['Started (UTC)','Result','New URLs','Restock / preorder','Unchanged','Web calls','Estimated USD','Details'],data.recent.map(r=>[r.started_at,r.status,r.new_listings??'Unmeasured',r.restocks??'—',r.unchanged??'—',r.web_calls??'Unknown',money(r.estimated_microusd),r.error??'—']),'No scans yet.')}</section>`;
  return response(operationsShell('Search & budget',content,operator,env,'/ops/search'));
}

export async function operationsRoute(request: Request, env: Env, operator: Operator): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/') return new Response(null,{status:302,headers:{location:'/ops','cache-control':'no-store'}});
  if (path === '/approvals' && url.searchParams.get('view') !== 'queue') return approvedInventoryOperations(request,env,operator);
  if (!path.startsWith('/ops')) return null;
  if (path === '/ops/trusted-stores') return trustedStoreOperations(request,env,operator);
  if (path === '/ops/stores') return storeCatalogOperations(request,env,operator);
  if (path === '/ops/search/audit') return searchAuditOperations(request,env,operator);
  if (path === '/ops/search') return searchOperations(request,env,operator);
  if (path === '/ops/customers') return customerOperations(request,env,operator);
  if (path === '/ops/customer-support') return customerSupportOperations(request,env,operator);
  if (path === '/ops/people' && operator.role !== 'owner') return operationsError('Only the owner can manage access.',403,operator,env);
  if (request.method === 'POST' && path === '/ops/people') {
    const form = await request.formData(), email=String(form.get('email')??'').trim().toLowerCase(), role=String(form.get('role')??''), status=String(form.get('status')??''), reason=String(form.get('reason')??'').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || email===env.OPS_OWNER_EMAIL?.trim().toLowerCase() || !['admin','viewer'].includes(role) || !['ACTIVE','REVOKED'].includes(status) || !reason || reason.length>500) return operationsError('Enter a valid member email, role, access status, and reason. The owner account cannot be changed here.',400,operator,env);
    const now=new Date().toISOString();
    await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare('INSERT INTO ops_members(email,role,status,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,status=excluded.status,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(email,role,status,now,operator.email),
      env.SPAWN_DB.prepare('INSERT INTO ops_access_decisions(email,role,status,decided_by,reason,decided_at) VALUES(?,?,?,?,?,?)').bind(email,role,status,operator.email,reason,now)
    ]);
    return new Response(null,{status:303,headers:{location:'/ops/people?saved=1','cache-control':'no-store'}});
  }
  if(request.method!=='GET')return operationsError('This action is not supported.',405,operator,env);
  let content='',title='Overview';
  if (path==='/ops') {
    const [inventory,queue,recent]=await Promise.all([
      env.SPAWN_DB.prepare('SELECT COUNT(*) total, MAX(last_seen_at) freshest FROM inventory').first<{total:number;freshest:string|null}>(),
      env.SPAWN_DB.prepare("SELECT COUNT(*) total FROM monitoring_candidates WHERE review_eligible=1 AND status='PENDING'").first<{total:number}>(),
      env.SPAWN_DB.prepare('SELECT started_at,status,error FROM scan_runs ORDER BY started_at DESC LIMIT 5').all<Record<string,unknown>>()
    ]);
    content=`<div class="ops-metrics"><div class="ops-metric"><span>Listing reviews pending</span><strong>${esc(queue?.total??0)}</strong><a href="/approvals">Open approval queue →</a></div><div class="ops-metric"><span>Inventory listings</span><strong>${esc(inventory?.total??0)}</strong><a href="/inventory">Browse inventory →</a></div><div class="ops-metric"><span>Latest discovery scan</span><strong style="font-size:1.3rem">${esc(recent.results[0]?.status??'No scans yet')}</strong><span>${esc(recent.results[0]?.started_at??'Waiting for the first scan')}</span></div></div><section><h2>Review together, with a clear record</h2><p>Inspect the product identity and delivery evidence, choose visibility or monitoring, and record the reason for your decision.</p><a class="ops-primary" href="/approvals">Open approvals</a></section><section><h2>Recent discovery scans</h2>${table(['Started (UTC)','Result','Details'],recent.results.map(r=>[r.started_at,r.status,r.error??'—']),'No discovery scans recorded in this environment.')}</section><p class="ops-muted">Inventory last observed: ${esc(inventory?.freshest??'No observations yet')}. Refresh this page for the latest state.</p>`;
  } else if(path==='/ops/people') {
    title='People & roles';
    const members=await env.SPAWN_DB.prepare('SELECT email,role,status,updated_at FROM ops_members ORDER BY email').all<Record<string,unknown>>();
    content=`${url.searchParams.has('saved')?'<p class="ops-alert" role="status">Access updated. No invitation email was sent.</p>':''}<section><h2>Team access</h2>${table(['Email','Role','Access','Last changed'],[[env.OPS_OWNER_EMAIL,'owner','ACTIVE','Configured owner'],...members.results.map(m=>[m.email,m.role,m.status,m.updated_at])],'No members yet.')}</section><section><h2>Grant, change, or revoke access</h2><p>Administrators can make review decisions. Viewers can inspect the workspace. Revocation blocks the member’s next request, including an existing session.</p><form class="ops-form" method="post"><label>Email<input name="email" type="email" maxlength="254" required></label><label>Role<select name="role"><option value="admin">Administrator</option><option value="viewer">Viewer</option></select></label><label>Access<select name="status"><option value="ACTIVE">Allow access</option><option value="REVOKED">Revoke access</option></select></label><label>Reason<textarea name="reason" maxlength="500" required></textarea></label><button class="ops-primary">Save access</button></form><p class="ops-muted">Share the website address after granting access. The member must also meet the website’s sign-in policy. This form does not send email.</p></section>`;
  } else if(path==='/ops/activity') {
    title='Activity';
    const history=await env.SPAWN_DB.prepare(`SELECT * FROM (
      SELECT decided_at,decided_by,'Amazon '||decision action,asin subject,reason FROM amazon_catalog_decisions
      UNION ALL SELECT decided_at,decided_by,'Listing '||decision,candidate_id,reason FROM listing_publication_decisions
      UNION ALL SELECT decided_at,decided_by,'Campaign publication',campaign_id,reason FROM seed_campaign_publications
      UNION ALL SELECT decided_at,decided_by,'Pricing reference',product_id,reason FROM pricing_reference_decisions
      UNION ALL SELECT decided_at,decided_by,'Access '||status||' ('||role||')',email,reason FROM ops_access_decisions
    ) ORDER BY decided_at DESC LIMIT 100`).all<Record<string,unknown>>();
    content=`<section><h2>Latest 100 decisions</h2>${table(['Time (UTC)','Person','Action','Item','Reason'],history.results.map(r=>[r.decided_at,r.decided_by,r.action,r.subject,r.reason]),'No decisions recorded yet. Completed reviews and access changes will appear here.')}</section>`;
  } else if(path==='/ops/account') {
    title='My account';content=`<section><h2>${esc(operator.email)}</h2><p>Role: <strong>${esc(operator.role)}</strong></p><p>Sign in with your approved email address and the code sent to your inbox. You do not need a Cloudflare account. Complete your device verification when prompted.</p><p>You may be asked to sign in again when your session expires.</p><a class="ops-primary" href="/cdn-cgi/access/logout">Sign out</a></section><section><h2>Set up or manage MFA</h2><ol><li>Open <a href="${esc(env.OPS_ACCESS_ISSUER ?? "")}" target="_blank" rel="noreferrer">Account and MFA settings</a> in this browser.</li><li>Choose <strong>Account → Account → MFA Devices</strong>, then <strong>Add an MFA device</strong>.</li><li>Choose biometrics for your device, or an authenticator application, and follow the prompts. Adding a device may require verification with your existing method.</li><li>Return here or choose <strong>Open Garfield Admin</strong> in the launcher.</li></ol><p>If you lose your only verification method, contact the owner for recovery. Never share email codes or authenticator setup keys.</p></section><section><h2>Your first review</h2><ol><li>Open <a href="/approvals">Approvals</a> and review the direct listing, product identity, seller and Mexico delivery evidence.</li><li>Approve only when the required evidence is complete. Otherwise leave it pending or reject it with a clear reason.</li><li>Check <a href="/ops/activity">Activity</a> for your email and decision. Published listings appear in <a href="/inventory">Inventory</a>.</li></ol>${env.OPS_ENVIRONMENT?.startsWith("Staging") ? "<p>Items labeled SAMPLE are training exercises in this isolated staging site.</p>" : "<p>Decisions here affect live operations. Use verified listing evidence; do not submit training decisions.</p>"}</section>`;
  } else if(path==='/ops/vendors') {
    title='Vendors';const vendors=await env.SPAWN_DB.prepare('SELECT vendor_name,status,updated_at,reason FROM vendors ORDER BY vendor_name').all<Record<string,unknown>>();
    content=`<section><h2>Vendor registry</h2>${table(['Vendor','Status','Updated (UTC)','Reason'],vendors.results.map(r=>[r.vendor_name,r.status,r.updated_at,r.reason]),'No vendor status records yet.')}</section>`;
  } else if(path==='/ops/health') {
    title='System health'; const recent=await env.SPAWN_DB.prepare('SELECT started_at,finished_at,status,error FROM scan_runs ORDER BY started_at DESC LIMIT 20').all<Record<string,unknown>>();
    content=`<section><h2>Spawn</h2><p>Database reachable. Configuration: ${esc(env.SPAWN_CONFIG_VERSION)}.</p>${table(['Started (UTC)','Finished (UTC)','Result','Details'],recent.results.map(r=>[r.started_at,r.finished_at,r.status,r.error]),'No scans recorded.')}</section><section><h2>Catch and detailed diagnostics</h2><p>Inspect reported tracking coverage, enrichment, customer delivery, and pricing references.</p><a href="/dashboard">Open detailed diagnostics →</a></section>`;
  } else return operationsError('Page not found.',404,operator,env);
  return response(operationsShell(title,content,operator,env,path));
}
