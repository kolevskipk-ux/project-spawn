import { RESPONSE_SCHEMA, SCAN_INSTRUCTIONS } from "./config";
import { boardHeaders, boardRows, renderBoard } from "./board";
import { updateInventory } from "./inventory";
import { acquireManualCooldown, acquireScanLock, allowedBy, auditSecurityEvent, feedbackClientNonce, OperationalGuardError, releaseScanLock, requestRateKey } from "./security";
import { parseBenchmarkCandidate, storeBenchmarkCandidate, verifyCatchSignature } from "./benchmarks";
import type { Env, ScanResult } from "./types";
import { isQuietWindow, normalizeVendor } from "./garfield";
import { dashboardData, renderDashboard } from "./dashboard";
import { handleWeeklyFeedback } from "./weekly-feedback";
import { retryApprovalRequests, reviewAmazonCandidate, runAmazonVerification, type ReviewAction } from "./verification";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function callOpenAI(env: Env): Promise<ScanResult> {
  const suppressed = await env.SPAWN_DB.prepare("SELECT vendor_name FROM vendors WHERE status='SUPPRESSED'").all<{vendor_name:string}>();
  const suppressionInstruction = suppressed.results.length ? ` Do not search, evaluate, or return listings from these suppressed vendors: ${suppressed.results.map(row=>row.vendor_name).join(", ")}.` : "";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_MODEL, instructions: SCAN_INSTRUCTIONS,
      input: `Run the current hourly Spawn scan. Use web search and return the structured result.${suppressionInstruction}`, tools: [{ type: "web_search" }],
      text: { format: { type: "json_schema", name: "spawn_scan", strict: true, schema: RESPONSE_SCHEMA } }, store: false })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAI returned no structured output text");
  return JSON.parse(outputText) as ScanResult;
}

async function runScan(env: Env, triggerSource: "cron" | "manual"): Promise<{ id: string; result: ScanResult }> {
  const id = crypto.randomUUID();
  const started = new Date();
  if (!await acquireScanLock(env, id, started)) {
    await auditSecurityEvent(env, "scan_blocked_lock", id, { trigger_source: triggerSource }).catch(console.error);
    throw new OperationalGuardError("scan_in_progress", 409);
  }
  try {
    if (triggerSource === "manual") {
      if (!await acquireManualCooldown(env, started)) {
        await auditSecurityEvent(env, "manual_scan_blocked_cooldown", id).catch(console.error);
        throw new OperationalGuardError("manual_cooldown", 429);
      }
      await auditSecurityEvent(env, "manual_scan_accepted", id).catch(console.error);
    }
    await env.SPAWN_DB.prepare("INSERT INTO scan_runs (id, started_at, trigger_source, status, config_version, model) VALUES (?, ?, ?, 'running', ?, ?)")
      .bind(id, started.toISOString(), triggerSource, env.SPAWN_CONFIG_VERSION, env.OPENAI_MODEL).run();
    try {
      const result = await callOpenAI(env);
      await updateInventory(env, id, result.listings, started.toISOString());
      const resultJson = JSON.stringify(result);
      const resultHash = await sha256(resultJson);
      const finished = new Date().toISOString();
      await env.SPAWN_DB.batch([
        env.SPAWN_DB.prepare("UPDATE scan_runs SET finished_at=?, status='succeeded', result_json=?, result_hash=?, discord_message_id=NULL WHERE id=?").bind(finished, resultJson, resultHash, id),
        env.SPAWN_DB.prepare("INSERT INTO worker_state (key, value, updated_at) VALUES ('last_success', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
          .bind(JSON.stringify({ id, finished_at: finished, result_hash: resultHash }), finished),
        env.SPAWN_DB.prepare("INSERT INTO worker_state (key, value, updated_at) VALUES ('amazon_discovery_window', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
          .bind(JSON.stringify({ scan_id:id, attempted_at:started.toISOString(), amazon_candidates:result.listings.filter(item=>Boolean(item.url.match(/amazon\.com\.mx/i))).length, exhaustive:false, limitation:"Web-search discovery cannot enumerate all Amazon Mexico listings" }), finished)
      ]);
      await retryApprovalRequests(env).catch(error=>console.error("approval request retry failed",error));
      if (triggerSource === "manual") await auditSecurityEvent(env, "manual_scan_succeeded", id).catch(console.error);
      return { id, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await env.SPAWN_DB.prepare("UPDATE scan_runs SET finished_at=?, status='failed', error=? WHERE id=?").bind(new Date().toISOString(), message.slice(0, 1000), id).run();
      if (triggerSource === "manual") await auditSecurityEvent(env, "manual_scan_failed", id, { error_class: error instanceof Error ? error.name : "unknown" }).catch(console.error);
      throw error;
    }
  } finally {
    await releaseScanLock(env, id).catch(console.error);
  }
}

const authorized = (request: Request, env: Env) => request.headers.get("authorization") === `Bearer ${env.RUN_TOKEN}`;
const boardAuthorized = (url: URL, env: Env) => Boolean(env.BOARD_ACCESS_TOKEN) && url.searchParams.get("access") === env.BOARD_ACCESS_TOKEN;
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function inventoryCsv(env: Env): Promise<Response> {
  const rows = await boardRows(env);
  const columns = ["title", "print_series", "watch_category", "retailer", "retailer_sku", "language", "price_mxn", "amazon_launch_mxn", "collectr_usd", "value_classification", "status", "availability_state", "last_change_type", "first_seen_at", "last_seen_at", "canonical_url"];
  const body = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column as keyof typeof row])).join(","))].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=spawn-inventory.csv", "cache-control": "no-store" } });
}

const html = (body: string, status = 200) => new Response(body, { status, headers:{ "content-type":"text/html; charset=utf-8", "cache-control":"no-store", "x-robots-tag":"noindex" } });

async function handleVendorIssue(request: Request, url: URL, env: Env): Promise<Response | null> {
  const match = url.pathname.match(/^\/vendor-issue\/([^/]+)$/); if (!match) return null;
  const record = await env.SPAWN_DB.prepare(`SELECT i.retailer, f.expires_at FROM feedback_tokens f JOIN inventory i ON i.listing_key=f.listing_key WHERE f.token=?`).bind(match[1]).first<{retailer:string;expires_at:string}>();
  if (!record || Date.parse(record.expires_at) < Date.now()) return html("<h1>Link expired</h1>", 410);
  if (request.method === "GET") return html(`<!doctype html><meta name="viewport" content="width=device-width"><title>Vendor issue</title><body style="font:18px system-ui;max-width:36rem;margin:12vh auto;padding:1rem"><h1>Report ${record.retailer.replace(/[&<>]/g,"")}</h1><p>This queues the vendor for operator review. A confirmed report suppresses it across Spawn and Catch Em All until reinstated.</p><form method="post"><label>Reason<br><textarea name="reason" maxlength="500" required></textarea></label><br><button>Submit vendor issue</button></form></body>`);
  if (request.method !== "POST") return null;
  const form = await request.formData(), reason = String(form.get("reason") ?? "").trim().slice(0,500); if (!reason) return html("<h1>Reason required</h1>",400);
  const key = normalizeVendor(record.retailer), now = new Date().toISOString(), reporter = request.headers.get("cf-access-authenticated-user-email") || null;
  await env.SPAWN_DB.prepare(`INSERT INTO vendor_issue_reports(vendor_key,vendor_name,reported_at,reporter,reason) VALUES(?,?,?,?,?)`).bind(key,record.retailer,now,reporter,reason).run();
  return html("<h1>Report queued</h1><p>An operator will review this vendor before any global suppression is applied.</p>");
}

async function sharedState(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (!url.pathname.startsWith("/internal/garfield/")) return null;
  if (!env.CATCH_INGEST_SECRET || request.headers.get("authorization") !== `Bearer ${env.CATCH_INGEST_SECRET}`) return json({error:"unauthorized"},401);
  if (request.method === "GET" && url.pathname === "/internal/garfield/vendors") {
    const rows=await env.SPAWN_DB.prepare("SELECT vendor_key,vendor_name,status,updated_at FROM vendors").all(); return json({vendors:rows.results});
  }
  if (request.method === "GET" && url.pathname === "/internal/garfield/monitoring-candidates") {
    const rows=await env.SPAWN_DB.prepare("SELECT * FROM monitoring_candidates WHERE status IN ('PENDING','ACCEPTED') ORDER BY discovered_at DESC LIMIT 200").all(); return json({candidates:rows.results});
  }
  if (request.method === "GET" && url.pathname === "/internal/garfield/amazon-watchlist") {
    const [version,rows]=await Promise.all([
      env.SPAWN_DB.prepare("SELECT value,updated_at FROM worker_state WHERE key='amazon_catalog_version'").first<{value:string;updated_at:string}>(),
      env.SPAWN_DB.prepare("SELECT asin,canonical_product_id,product_name,product_url,watch_category,language,priority,lane,routing_key,alert_on_initial_buyable,approved_by,approval_reason,approved_at,source,last_discovered_at,updated_at FROM amazon_watchlist WHERE lifecycle_status='PUBLISHED' ORDER BY CASE lane WHEN 'priority' THEN 0 ELSE 1 END, CASE priority WHEN 'BOSS' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, asin").all()
    ]);
    return json({schema_version:1,catalog_version:version?.value??"0",published_at:version?.updated_at??null,watchlist:rows.results});
  }
  return json({error:"not_found"},404);
}

async function adminVendor(request: Request, url: URL, env: Env): Promise<Response | null> {
  const issue=url.pathname.match(/^\/admin\/vendor-issues\/(\d+)$/);
  if(issue) {
    if(!authorized(request,env)) return json({error:"unauthorized"},401); if(request.method!=="PUT") return json({error:"method_not_allowed"},405);
    const body=await request.json().catch(()=>({})) as {decision?:string;reason?:string}; if(!["APPROVED","REJECTED"].includes(body.decision||"")) return json({error:"invalid_decision"},400);
    const report=await env.SPAWN_DB.prepare("SELECT * FROM vendor_issue_reports WHERE id=? AND status='PENDING'").bind(Number(issue[1])).first<{vendor_key:string;vendor_name:string;reason:string}>(); if(!report) return json({error:"not_found"},404);
    const now=new Date().toISOString(), statements=[env.SPAWN_DB.prepare("UPDATE vendor_issue_reports SET status=?,reviewed_at=?,review_reason=? WHERE id=?").bind(body.decision,now,body.reason??null,Number(issue[1]))];
    if(body.decision==="APPROVED") statements.push(env.SPAWN_DB.prepare(`INSERT INTO vendors(vendor_key,vendor_name,status,updated_at,updated_by,reason) VALUES(?,?,'SUPPRESSED',?,'operator',?) ON CONFLICT(vendor_key) DO UPDATE SET status='SUPPRESSED',updated_at=excluded.updated_at,updated_by='operator',reason=excluded.reason`).bind(report.vendor_key,report.vendor_name,now,report.reason),env.SPAWN_DB.prepare(`INSERT INTO vendor_status_audit(vendor_key,vendor_name,status,reported_at,reporter,reason) VALUES(?,?,'SUPPRESSED',?,'operator',?)`).bind(report.vendor_key,report.vendor_name,now,report.reason));
    await env.SPAWN_DB.batch(statements); return json({ok:true,status:body.decision});
  }
  const match=url.pathname.match(/^\/admin\/vendors\/([^/]+)$/); if(!match) return null;
  if(!authorized(request,env)) return json({error:"unauthorized"},401); if(request.method!=="PUT") return json({error:"method_not_allowed"},405);
  const body=await request.json().catch(()=>({})) as {status?:string;reason?:string}; if(!["ACTIVE","SUPPRESSED"].includes(body.status||"")) return json({error:"invalid_status"},400);
  const current=await env.SPAWN_DB.prepare("SELECT vendor_name FROM vendors WHERE vendor_key=?").bind(match[1]).first<{vendor_name:string}>(); if(!current) return json({error:"not_found"},404);
  const now=new Date().toISOString(); await env.SPAWN_DB.batch([env.SPAWN_DB.prepare("UPDATE vendors SET status=?,updated_at=?,updated_by='operator',reason=? WHERE vendor_key=?").bind(body.status,now,body.reason??null,match[1]),env.SPAWN_DB.prepare("INSERT INTO vendor_status_audit(vendor_key,vendor_name,status,reported_at,reporter,reason) VALUES(?,?,?,?,?,?)").bind(match[1],current.vendor_name,body.status,now,"operator",body.reason??null)]); return json({ok:true,status:body.status});
}

async function adminAmazonWatchlist(request: Request, url: URL, env: Env): Promise<Response | null> {
  const match=url.pathname.match(/^\/admin\/amazon-watchlist\/([A-Z0-9]{10})$/i); if(!match) return null;
  if(!authorized(request,env)) return json({error:"unauthorized"},401);
  return json({error:"legacy_endpoint_retired",message:"Use the evidence-bound dashboard workflow."},410);
}

async function dashboardVerification(request:Request,url:URL,env:Env):Promise<Response|null> {
  const match=url.pathname.match(/^\/dashboard\/verification\/([A-Z0-9]{10})$/i); if(!match) return null;
  if(!boardAuthorized(url,env)) return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
  if(request.method!=="POST") return json({error:"method_not_allowed"},405);
  const form=await request.formData(), action=String(form.get("action")||"");
  const asin=match[1].toUpperCase(), actor=request.headers.get("cf-access-authenticated-user-email")||"operator:dashboard";
  let result;
  if(action==="verify") result=await runAmazonVerification(env,asin,actor);
  else if(["approve","reject","publish"].includes(action)) result=await reviewAmazonCandidate(env,asin,action as ReviewAction,{
    attemptId:Number(form.get("attempt_id")), evidenceRevision:String(form.get("evidence_revision")||""), reason:String(form.get("reason")||""),
    lane:String(form.get("lane")||"") as "priority"|"normal", routingKey:String(form.get("routing_key")||"") as "pokemon-main"|"delta-reign"|"magic-hobbit",
    alertOnInitialBuyable:form.get("alert_on_initial_buyable")==="on"
  },actor);
  else result={ok:false as const,error:"invalid_action"};
  const destination=new URL("/dashboard",url); destination.searchParams.set("access",env.BOARD_ACCESS_TOKEN); destination.searchParams.set(result.ok?"notice":"error",result.ok?`${action}:${asin}`:result.error);
  return new Response(null,{status:303,headers:{location:destination.toString(),"cache-control":"no-store"}});
}

async function handleFeedback(request: Request, url: URL, env: Env): Promise<Response | null> {
  const match = url.pathname.match(/^\/feedback\/([^/]+)\/(got_one|too_expensive)$/);
  if (!match) return null;
  if (!await allowedBy(env.FEEDBACK_RATE_LIMIT, requestRateKey(request))) return new Response("Too many requests.", { status: 429, headers: { "retry-after": "60" } });
  const [, token, kind] = match;
  const record = await env.SPAWN_DB.prepare("SELECT listing_key, expires_at FROM feedback_tokens WHERE token=?").bind(token).first<{ listing_key: string; expires_at: string }>();
  if (!record || Date.parse(record.expires_at) < Date.now()) return new Response("This feedback link has expired.", { status: 410 });
  const count = await env.SPAWN_DB.prepare("SELECT COUNT(*) AS count FROM listing_feedback WHERE token=?").bind(token).first<{ count: number }>();
  if ((count?.count ?? 0) >= 100) return new Response("Feedback is closed for this alert.", { status: 429 });
  const client = feedbackClientNonce(request);
  const result = await env.SPAWN_DB.prepare("INSERT OR IGNORE INTO listing_feedback (token, listing_key, kind, created_at, client_nonce) VALUES (?, ?, ?, ?, ?)")
    .bind(token, record.listing_key, kind, new Date().toISOString(), client.nonce).run();
  const duplicate = (result.meta.changes ?? 0) === 0;
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" });
  if (client.isNew) headers.append("set-cookie", `spawn_feedback_id=${client.nonce}; Max-Age=31536000; Path=/feedback/; Secure; HttpOnly; SameSite=Lax`);
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Spawn feedback</title><body style="font:18px system-ui;max-width:36rem;margin:15vh auto;padding:1rem;background:#101114;color:#fff"><h1>${duplicate ? "Already recorded" : "Thanks!"}</h1><p>${duplicate ? "This feedback was already recorded from this device." : "Your anonymous feedback was recorded."} You can close this page and return to Discord.</p></body>`, { headers });
}

async function handleCatchIngest(request: Request, env: Env): Promise<Response> {
  if (!await allowedBy(env.INGEST_RATE_LIMIT, "catch_em_all")) return json({ error: "rate_limited" }, 429);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_384) return json({ error: "payload_too_large" }, 413);
  const body = await request.text();
  const timestamp = request.headers.get("x-spawn-timestamp");
  const signature = request.headers.get("x-spawn-signature");
  if (!await verifyCatchSignature(env.CATCH_INGEST_SECRET, timestamp, signature, body)) return json({ error: "unauthorized" }, 401);
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return json({ error: "invalid_payload" }, 400); }
  const candidate = parseBenchmarkCandidate(parsed);
  if (!candidate) return json({ error: "invalid_payload" }, 400);
  const receivedAt = new Date().toISOString();
  const created = await storeBenchmarkCandidate(env, candidate, receivedAt);
  await auditSecurityEvent(env, created ? "benchmark_candidate_received" : "benchmark_candidate_duplicate", candidate.event_id,
    { source_product_id: candidate.source_product_id, asin: candidate.asin }).catch(console.error);
  return json({ ok: true, accepted: created }, 202);
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const verification=await dashboardVerification(request,url,env); if(verification) return verification;
  const shared=await sharedState(request,url,env); if(shared) return shared;
  const amazonAdmin=await adminAmazonWatchlist(request,url,env); if(amazonAdmin) return amazonAdmin;
  const vendorAdmin=await adminVendor(request,url,env); if(vendorAdmin) return vendorAdmin;
  const vendorIssue=await handleVendorIssue(request,url,env); if(vendorIssue) return vendorIssue;
  const weeklyFeedback=await handleWeeklyFeedback(request,url,env); if(weeklyFeedback) return weeklyFeedback;
  if (request.method === "POST" && url.pathname === "/internal/benchmark-candidates") return handleCatchIngest(request, env);
  const feedback = request.method === "GET" ? await handleFeedback(request, url, env) : null;
  if (feedback) return feedback;
  if (request.method === "GET" && !await allowedBy(env.PUBLIC_RATE_LIMIT, requestRateKey(request))) return json({ error: "rate_limited" }, 429);
  if (request.method === "GET" && url.pathname === "/healthz") return json({ ok: true });
  if (request.method === "GET" && url.pathname === "/readyz") {
    try { await env.SPAWN_DB.prepare("SELECT 1").first(); return json({ ok: true }); }
    catch { return json({ ok: false }, 503); }
  }
  if (request.method === "GET" && url.pathname === "/version") return json({ version: env.SPAWN_CONFIG_VERSION });
  if (request.method === "GET" && url.pathname === "/admin/status") {
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
    const [lastSuccess, lock, cooldown, recent, benchmarkCandidates] = await Promise.all([
      env.SPAWN_DB.prepare("SELECT value, updated_at FROM worker_state WHERE key='last_success'").first(),
      env.SPAWN_DB.prepare("SELECT owner, acquired_at, expires_at FROM scan_locks WHERE name='global_scan'").first(),
      env.SPAWN_DB.prepare("SELECT next_allowed_at, updated_at FROM run_cooldowns WHERE name='manual_scan'").first(),
      env.SPAWN_DB.prepare("SELECT id, started_at, finished_at, trigger_source, status, config_version, error FROM scan_runs ORDER BY started_at DESC LIMIT 10").all(),
      env.SPAWN_DB.prepare("SELECT review_status, COUNT(*) AS count FROM benchmark_candidates GROUP BY review_status").all()
    ]);
    return json({ ok: true, version: env.CF_VERSION_METADATA ?? { id: "local" }, config_version: env.SPAWN_CONFIG_VERSION, model: env.OPENAI_MODEL,
      last_success: lastSuccess, scan_lock: lock, manual_cooldown: cooldown, recent_scans: recent.results,
      benchmark_candidates: benchmarkCandidates.results });
  }
  if (request.method === "GET" && url.pathname === "/inventory") {
    if (!boardAuthorized(url, env)) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(renderBoard(await boardRows(env), env.BOARD_ACCESS_TOKEN), { headers: boardHeaders() });
  }
  if (request.method === "GET" && url.pathname === "/dashboard") {
    if (!boardAuthorized(url, env)) return new Response("Not found", { status:404, headers:{"cache-control":"no-store"} });
    return new Response(renderDashboard(await dashboardData(env), env.BOARD_ACCESS_TOKEN), { headers:boardHeaders() });
  }
  if (request.method === "GET" && url.pathname === "/inventory.csv") {
    if (!authorized(request, env) && !boardAuthorized(url, env)) return json({ error: "unauthorized" }, 401);
    return inventoryCsv(env);
  }
  if (request.method === "POST" && url.pathname === "/run") {
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
    if (!await allowedBy(env.MANUAL_RATE_LIMIT, "global_manual_scan")) return json({ error: "rate_limited" }, 429);
    try { const scan = await runScan(env, "manual"); return json({ ok: true, scan_id: scan.id, result: scan.result }); }
    catch (error) {
      if (error instanceof OperationalGuardError) return json({ ok: false, error: error.code }, error.status);
      return json({ ok: false, error: "scan_failed" }, 502);
    }
  }
  return json({ error: "not_found" }, 404);
}

export function isAmazonDiscoveryWindow(now: Date, timezone: string): boolean {
  const hour=Number(new Intl.DateTimeFormat("en-CA",{timeZone:timezone,hour:"2-digit",hourCycle:"h23"}).format(now));
  return Number.isInteger(hour) && hour % 3 === 0;
}

export default { fetch: handleFetch, scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  if (isQuietWindow(new Date(), env.SPAWN_TIMEZONE, env.SPAWN_QUIET_START ?? "02:05", env.SPAWN_QUIET_END ?? "06:05")) return;
  ctx.waitUntil(retryApprovalRequests(env).catch((error)=>console.error("approval request retry failed",error)));
  if (!isAmazonDiscoveryWindow(new Date(),env.SPAWN_TIMEZONE)) return;
  ctx.waitUntil(runScan(env, "cron").catch((error) => console.error("scheduled scan failed", error)));
} } satisfies ExportedHandler<Env>;

export { handleFetch, runScan };
