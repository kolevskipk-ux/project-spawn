import { RESPONSE_SCHEMA, SCAN_INSTRUCTIONS } from "./config";
import { updateInventory } from "./inventory";
import type { Env, InventoryChange, ScanResult } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function callOpenAI(env: Env): Promise<ScanResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_MODEL, instructions: SCAN_INSTRUCTIONS,
      input: "Run the current hourly Spawn scan. Use web search and return the structured result.", tools: [{ type: "web_search" }],
      text: { format: { type: "json_schema", name: "spawn_scan", strict: true, schema: RESPONSE_SCHEMA } }, store: false })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const outputText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAI returned no structured output text");
  return JSON.parse(outputText) as ScanResult;
}

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")} MXN`;
const languageLabel = (language: InventoryChange["listing"]["language"]) => ({ english: "English", spanish: "Spanish", bilingual: "Bilingual", japanese: "Japanese", unknown: "Language unconfirmed" })[language];

function valueLine(change: InventoryChange): string {
  const { price_mxn: price, msrp_mxn: msrp } = change.listing;
  if (msrp == null) return "MSRP: **unconfirmed**";
  if (price == null) return `MSRP: **${money(msrp)}** • Current-price comparison unavailable`;
  const difference = Math.round(((price - msrp) / msrp) * 100);
  if (difference > 0) return `MSRP: **${money(msrp)}** • **${difference}% above MSRP${difference >= 25 ? " ⚠️" : ""}**`;
  if (difference < 0) return `MSRP: **${money(msrp)}** • **${Math.abs(difference)}% below MSRP ✅**`;
  return `MSRP: **${money(msrp)}** • At MSRP ✅`;
}

function alertText(change: InventoryChange): string {
  const badge = change.type === "new" ? "🆕 NEW LISTING" : change.type === "restock" ? "🔄 RESTOCK" : "📉 PRICE DROP";
  return [`**${badge}**`, `**${change.listing.title}**`, `${change.listing.retailer}${change.listing.price_mxn == null ? "" : ` — **${money(change.listing.price_mxn)}**`}`,
    `Language: **${languageLabel(change.listing.language)}**`, valueLine(change), change.listing.url].join("\n").slice(0, 1900);
}

function heartbeatText(timestamp: Date, timezone: string, baseline: boolean): string {
  const when = new Intl.DateTimeFormat("en-MX", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  return ["🐣 **SPAWN — Hourly Scan**", `🕐 ${when}`, "", "✅ Scheduled check completed.", "",
    baseline ? "Inventory baseline established. Future alerts will identify new listings, restocks, and price drops."
      : "No verified new listings, restocks, or meaningful price drops this hour."].join("\n");
}

async function postDiscord(env: Env, payload: Record<string, unknown>, components = false): Promise<string | null> {
  const response = await fetch(`${env.DISCORD_WEBHOOK_URL}${components ? "?wait=true&with_components=true" : "?wait=true"}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } })
  });
  if (!response.ok) throw new Error(`Discord ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return ((await response.json()) as { id?: string }).id ?? null;
}

async function postChange(env: Env, scanId: string, change: InventoryChange): Promise<string | null> {
  const token = crypto.randomUUID();
  const created = new Date();
  await env.SPAWN_DB.prepare("INSERT INTO feedback_tokens (token, scan_id, listing_key, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(token, scanId, change.listingKey, created.toISOString(), new Date(created.getTime() + 90 * 86400000).toISOString()).run();
  const feedback = (kind: string) => `${env.PUBLIC_BASE_URL}/feedback/${token}/${kind}`;
  return postDiscord(env, { content: alertText(change), components: [{ type: 1, components: [
    { type: 2, style: 5, label: "✅ Got one", url: feedback("got_one") },
    { type: 2, style: 5, label: "💸 Too expensive", url: feedback("too_expensive") }
  ] }] }, true);
}

async function runScan(env: Env, triggerSource: "cron" | "manual"): Promise<{ id: string; result: ScanResult }> {
  const id = crypto.randomUUID();
  const started = new Date();
  await env.SPAWN_DB.prepare("INSERT INTO scan_runs (id, started_at, trigger_source, status, config_version, model) VALUES (?, ?, ?, 'running', ?, ?)")
    .bind(id, started.toISOString(), triggerSource, env.SPAWN_CONFIG_VERSION, env.OPENAI_MODEL).run();
  try {
    const result = await callOpenAI(env);
    const inventory = await updateInventory(env, id, result.listings, started.toISOString());
    const actionable = inventory.changes.filter((change) => ["new", "restock", "price_drop"].includes(change.type)).slice(0, 5);
    const messageIds: string[] = [];
    if (actionable.length) {
      for (const change of actionable) { const messageId = await postChange(env, id, change); if (messageId) messageIds.push(messageId); }
    } else {
      const messageId = await postDiscord(env, { content: heartbeatText(started, env.SPAWN_TIMEZONE, inventory.baseline) }); if (messageId) messageIds.push(messageId);
    }
    const resultJson = JSON.stringify(result);
    const resultHash = await sha256(resultJson);
    const finished = new Date().toISOString();
    await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare("UPDATE scan_runs SET finished_at=?, status='succeeded', result_json=?, result_hash=?, discord_message_id=? WHERE id=?").bind(finished, resultJson, resultHash, messageIds.join(","), id),
      env.SPAWN_DB.prepare("INSERT INTO worker_state (key, value, updated_at) VALUES ('last_success', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
        .bind(JSON.stringify({ id, finished_at: finished, result_hash: resultHash }), finished)
    ]);
    return { id, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.SPAWN_DB.prepare("UPDATE scan_runs SET finished_at=?, status='failed', error=? WHERE id=?").bind(new Date().toISOString(), message.slice(0, 1000), id).run();
    throw error;
  }
}

const authorized = (request: Request, env: Env) => request.headers.get("authorization") === `Bearer ${env.RUN_TOKEN}`;
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function inventoryCsv(env: Env): Promise<Response> {
  const rows = await env.SPAWN_DB.prepare(`SELECT title, watch_category, retailer, retailer_sku, language, price_mxn, msrp_mxn, status, last_change_type,
    first_seen_at, last_seen_at, canonical_url FROM inventory ORDER BY status='available' DESC, last_seen_at DESC`).all<Record<string, unknown>>();
  const columns = ["title", "watch_category", "retailer", "retailer_sku", "language", "price_mxn", "msrp_mxn", "status", "last_change_type", "first_seen_at", "last_seen_at", "canonical_url"];
  const body = [columns.join(","), ...rows.results.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=spawn-inventory.csv", "cache-control": "no-store" } });
}

async function handleFeedback(pathname: string, env: Env): Promise<Response | null> {
  const match = pathname.match(/^\/feedback\/([^/]+)\/(got_one|too_expensive)$/);
  if (!match) return null;
  const [, token, kind] = match;
  const record = await env.SPAWN_DB.prepare("SELECT listing_key, expires_at FROM feedback_tokens WHERE token=?").bind(token).first<{ listing_key: string; expires_at: string }>();
  if (!record || Date.parse(record.expires_at) < Date.now()) return new Response("This feedback link has expired.", { status: 410 });
  await env.SPAWN_DB.prepare("INSERT INTO listing_feedback (token, listing_key, kind, created_at) VALUES (?, ?, ?, ?)").bind(token, record.listing_key, kind, new Date().toISOString()).run();
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Spawn feedback</title><body style="font:18px system-ui;max-width:36rem;margin:15vh auto;padding:1rem;background:#101114;color:#fff"><h1>Thanks!</h1><p>Your anonymous feedback was recorded. You can close this page and return to Discord.</p></body>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const feedback = request.method === "GET" ? await handleFeedback(url.pathname, env) : null;
  if (feedback) return feedback;
  if (request.method === "GET" && url.pathname === "/healthz") return json({ ok: true, service: "project-spawn", version: env.CF_VERSION_METADATA?.id ?? "local" });
  if (request.method === "GET" && url.pathname === "/readyz") {
    try { return json({ ok: true, database: "reachable", last_success: await env.SPAWN_DB.prepare("SELECT value, updated_at FROM worker_state WHERE key='last_success'").first() }); }
    catch { return json({ ok: false, database: "unreachable" }, 503); }
  }
  if (request.method === "GET" && url.pathname === "/version") return json({ version: env.CF_VERSION_METADATA ?? { id: "local" }, config_version: env.SPAWN_CONFIG_VERSION, model: env.OPENAI_MODEL });
  if (request.method === "GET" && url.pathname === "/inventory.csv") { if (!authorized(request, env)) return json({ error: "unauthorized" }, 401); return inventoryCsv(env); }
  if (request.method === "POST" && url.pathname === "/run") {
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
    try { const scan = await runScan(env, "manual"); return json({ ok: true, scan_id: scan.id, result: scan.result }); }
    catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502); }
  }
  return json({ service: "project-spawn", endpoints: ["/healthz", "/readyz", "/version"] }, 404);
}

export default { fetch: handleFetch, scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  ctx.waitUntil(runScan(env, "cron").catch((error) => console.error("scheduled scan failed", error)));
} } satisfies ExportedHandler<Env>;

export { alertText, heartbeatText };
