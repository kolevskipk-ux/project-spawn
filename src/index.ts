import { RESPONSE_SCHEMA, SCAN_INSTRUCTIONS } from "./config";
import type { Env, ScanResult } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function requestId(): string { return crypto.randomUUID(); }

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callOpenAI(env: Env): Promise<ScanResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      instructions: SCAN_INSTRUCTIONS,
      input: "Run the current hourly Spawn scan. Use web search and return the structured result.",
      tools: [{ type: "web_search" }],
      text: { format: { type: "json_schema", name: "spawn_scan", strict: true, schema: RESPONSE_SCHEMA } },
      store: false
    })
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as { output_text?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
  const outputText = payload.output_text ?? payload.output?.flatMap((x) => x.content ?? []).find((x) => x.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAI returned no structured output text");
  return JSON.parse(outputText) as ScanResult;
}

function discordText(result: ScanResult, timestamp: Date, timezone: string): string {
  const when = new Intl.DateTimeFormat("en-MX", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  const available = result.listings.filter((x) => x.status === "available").slice(0, 5)
    .map((x) => `• **${x.title}** — ${x.retailer}${x.price_mxn == null ? "" : ` — $${x.price_mxn.toLocaleString("en-US")} MXN`}\n  ${x.url}`)
    .join("\n");
  return [
    "🐣 **SPAWN — Hourly Scan**", `🕐 ${when}`, "",
    "✅ Scheduled check completed.",
    ...(available
      ? ["", "🎯 **Verified availability**", available]
      : ["", "No verified availability to report this hour."])
  ].join("\n").slice(0, 1950);
}

async function postDiscord(env: Env, content: string): Promise<string | null> {
  const response = await fetch(`${env.DISCORD_WEBHOOK_URL}?wait=true`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
  });
  if (!response.ok) throw new Error(`Discord ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return ((await response.json()) as { id?: string }).id ?? null;
}

async function runScan(env: Env, triggerSource: "cron" | "manual"): Promise<{ id: string; result: ScanResult }> {
  const id = requestId();
  const started = new Date();
  await env.SPAWN_DB.prepare("INSERT INTO scan_runs (id, started_at, trigger_source, status, config_version, model) VALUES (?, ?, ?, 'running', ?, ?)")
    .bind(id, started.toISOString(), triggerSource, env.SPAWN_CONFIG_VERSION, env.OPENAI_MODEL).run();
  try {
    const result = await callOpenAI(env);
    const resultJson = JSON.stringify(result);
    const hash = await sha256(resultJson);
    const discordId = await postDiscord(env, discordText(result, started, env.SPAWN_TIMEZONE));
    const finished = new Date().toISOString();
    await env.SPAWN_DB.batch([
      env.SPAWN_DB.prepare("UPDATE scan_runs SET finished_at = ?, status = 'succeeded', result_json = ?, result_hash = ?, discord_message_id = ? WHERE id = ?")
        .bind(finished, resultJson, hash, discordId, id),
      env.SPAWN_DB.prepare("INSERT INTO worker_state (key, value, updated_at) VALUES ('last_success', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .bind(JSON.stringify({ id, finished_at: finished, result_hash: hash }), finished)
    ]);
    return { id, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.SPAWN_DB.prepare("UPDATE scan_runs SET finished_at = ?, status = 'failed', error = ? WHERE id = ?")
      .bind(new Date().toISOString(), message.slice(0, 1000), id).run();
    throw error;
  }
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ ok: true, service: "project-spawn", version: env.CF_VERSION_METADATA?.id ?? "local" });
  }
  if (request.method === "GET" && url.pathname === "/readyz") {
    try {
      const last = await env.SPAWN_DB.prepare("SELECT value, updated_at FROM worker_state WHERE key = 'last_success'").first();
      return json({ ok: true, database: "reachable", last_success: last ?? null });
    } catch { return json({ ok: false, database: "unreachable" }, 503); }
  }
  if (request.method === "GET" && url.pathname === "/version") {
    return json({ version: env.CF_VERSION_METADATA ?? { id: "local" }, config_version: env.SPAWN_CONFIG_VERSION, model: env.OPENAI_MODEL });
  }
  if (request.method === "POST" && url.pathname === "/run") {
    if (request.headers.get("authorization") !== `Bearer ${env.RUN_TOKEN}`) return json({ error: "unauthorized" }, 401);
    try { const scan = await runScan(env, "manual"); return json({ ok: true, scan_id: scan.id, result: scan.result }); }
    catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502); }
  }
  return json({ service: "project-spawn", endpoints: ["/healthz", "/readyz", "/version"] }, 404);
}

export default {
  fetch: handleFetch,
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScan(env, "cron").catch((error) => console.error("scheduled scan failed", error)));
  }
} satisfies ExportedHandler<Env>;

export { discordText };
