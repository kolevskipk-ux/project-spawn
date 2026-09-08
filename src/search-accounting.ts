import type {Env, InventoryChange} from './types';
import {OperationalGuardError} from './security';

export const SEARCH_BUDGET_MICROUSD = 150_000_000;
export const EMPTY_SCAN_REVIEW_THRESHOLD = 100;
export const SEARCH_MAX_TOOL_CALLS = 12;
export const SEARCH_MAX_OUTPUT_TOKENS = 16_000;
// Conservative operating reserve, not a provider-side dollar limit. Unknown
// charges retain it; an overrun blocks further dispatch pending reconciliation.
export const SEARCH_RESERVE_MICROUSD = 10_000_000;
const PRICING_VERSION = 'terra-standard-2026-09-08';

export function searchMonth(now: Date, timezone = 'America/Mexico_City'): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:timezone,year:'numeric',month:'2-digit'}).formatToParts(now);
  return `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`;
}

export interface SearchResponse {
  id?: string;
  model?: string;
  service_tier?: string;
  status?: string;
  output_text?: string;
  output?: Array<{type?:string;status?:string;content?:Array<{type?:string;text?:string}>}>;
  usage?: {input_tokens:number;output_tokens:number;input_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number}};
}

export function estimateSearchCost(payload: SearchResponse): {microusd:number;webCalls:number} | null {
  const usage = payload.usage;
  if (!usage || !Array.isArray(payload.output) || payload.service_tier !== 'default' ||
      !/^gpt-5\.6-terra(?:-\d{4}-\d{2}-\d{2})?$/.test(payload.model ?? '')) return null;
  const input=usage.input_tokens, output=usage.output_tokens;
  const cached=usage.input_tokens_details?.cached_tokens ?? 0;
  const writes=usage.input_tokens_details?.cache_write_tokens ?? 0;
  if (![input,output,cached,writes].every(v=>Number.isSafeInteger(v)&&v>=0) || cached+writes>input) return null;
  const webCalls=payload.output.filter(item=>item.type==='web_search_call').length;
  // Input usage includes search content; charge tool invocations separately.
  // Conservatively use long-context rates when aggregate input exceeds 272k.
  const inputMultiplier=input>272_000?2:1, outputMultiplier=input>272_000?1.5:1;
  const microusd=Math.ceil(((input-cached-writes)*2+cached*0.2+writes*2.5)*inputMultiplier+output*12*outputMultiplier+webCalls*10_000);
  return {microusd,webCalls};
}

export async function reserveSearch(env:Env, scanId:string, now:Date):Promise<void> {
  if (env.OPENAI_MODEL !== 'gpt-5.6-terra') throw new OperationalGuardError('search_pricing_unconfigured',429);
  const month=searchMonth(now,env.SPAWN_TIMEZONE);
  // Once the first opening balance is reconciled, future months start at zero.
  await env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO search_budget_months(month,opening_microusd,recorded_at,recorded_by,reason)
    SELECT ?,0,?,'system','New tracked calendar month' WHERE EXISTS(SELECT 1 FROM search_budget_months WHERE month < ?)`)
    .bind(month,now.toISOString(),month).run();
  const inserted=await env.SPAWN_DB.prepare(`INSERT INTO search_accounting(scan_id,month,reserved_microusd,pricing_version)
    SELECT ?,month,?,? FROM search_budget_months WHERE month=?
    AND opening_microusd + COALESCE((SELECT SUM(COALESCE(estimated_microusd,reserved_microusd)) FROM search_accounting WHERE month=?),0) + ? <= ?
    AND NOT EXISTS(SELECT 1 FROM search_accounting WHERE estimated_microusd > reserved_microusd)`)
    .bind(scanId,SEARCH_RESERVE_MICROUSD,PRICING_VERSION,month,month,SEARCH_RESERVE_MICROUSD,SEARCH_BUDGET_MICROUSD).run();
  if (!inserted.meta.changes) throw new OperationalGuardError('search_budget_review_required',429);
}

export async function settleSearch(env:Env,scanId:string,payload:SearchResponse):Promise<void> {
  const estimate=estimateSearchCost(payload);
  await env.SPAWN_DB.prepare(`UPDATE search_accounting SET response_id=?,usage_json=?,web_calls=?,estimated_microusd=?,settled_at=?
    WHERE scan_id=? AND settled_at IS NULL`).bind(payload.id??null,JSON.stringify(payload.usage??null),estimate?.webCalls??null,estimate?.microusd??null,new Date().toISOString(),scanId).run();
}

export function yieldStatement(env:Env,scanId:string,changes:InventoryChange[],discoveries:InventoryChange[],baseline:boolean,now:string):D1PreparedStatement {
  // Baseline initialization is excluded rather than misrepresented as zero yield.
  return env.SPAWN_DB.prepare(`UPDATE search_accounting SET new_listings=?,restocks=?,unchanged=?,yield_recorded_at=? WHERE scan_id=?`)
    .bind(baseline?null:discoveries.length,changes.filter(c=>c.type==='restock'||c.type==='preorder_open').length,changes.filter(c=>c.type==='unchanged'&&!discoveries.some(d=>d.listingKey===c.listingKey)).length,now,scanId);
}

const STREAK_QUERY = `WITH completed AS (
    SELECT a.scan_id,a.new_listings,ROW_NUMBER() OVER(ORDER BY a.yield_recorded_at DESC,a.scan_id DESC) position
    FROM search_accounting a JOIN scan_runs s ON s.id=a.scan_id
    WHERE s.status='succeeded' AND a.new_listings IS NOT NULL)
    SELECT COUNT(*) streak FROM completed WHERE position < COALESCE((SELECT MIN(position) FROM completed WHERE new_listings>0),9223372036854775807)`;

export async function emptyScanStreak(env:Env):Promise<number> {
  const row=await env.SPAWN_DB.prepare(STREAK_QUERY)
    .first<{streak:number}>();
  return row?.streak??0;
}

export async function flagSearchReview(env:Env,scanId:string):Promise<void> {
  await searchReviewStatement(env,scanId,new Date().toISOString()).run();
}

export function searchReviewStatement(env:Env,scanId:string,now:string):D1PreparedStatement {
  // Persist the crossing even if a later scan discovers something before review.
  return env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO search_reviews(scan_id,triggered_at,consecutive_empty)
    SELECT ?,?,streak FROM (${STREAK_QUERY}) WHERE NOT EXISTS(SELECT 1 FROM search_reviews WHERE reviewed_at IS NULL)
    AND streak >= ? + COALESCE((SELECT MAX(consecutive_empty) FROM search_reviews WHERE triggered_at >=
      COALESCE((SELECT MAX(a.yield_recorded_at) FROM search_accounting a JOIN scan_runs s ON s.id=a.scan_id
        WHERE s.status='succeeded' AND a.new_listings>0),'')),0)`)
    .bind(scanId,now,EMPTY_SCAN_REVIEW_THRESHOLD);
}

export async function searchAccountingData(env:Env,now=new Date()) {
  const month=searchMonth(now,env.SPAWN_TIMEZONE);
  const [budget,totals,recent,reviews,streak]=await Promise.all([
    env.SPAWN_DB.prepare('SELECT * FROM search_budget_months WHERE month=?').bind(month).first<{opening_microusd:number;recorded_at:string}>(),
    env.SPAWN_DB.prepare(`SELECT COALESCE(SUM(estimated_microusd),0) estimated,
      COALESCE(SUM(CASE WHEN estimated_microusd IS NULL THEN reserved_microusd ELSE 0 END),0) held,
      COUNT(*) requests,COALESCE(SUM(new_listings),0) new_listings FROM search_accounting WHERE month=?`).bind(month).first<{estimated:number;held:number;requests:number;new_listings:number}>(),
    env.SPAWN_DB.prepare(`SELECT s.id,s.started_at,s.status,s.error,a.new_listings,a.restocks,a.unchanged,a.web_calls,a.estimated_microusd,a.reserved_microusd
      FROM scan_runs s LEFT JOIN search_accounting a ON a.scan_id=s.id ORDER BY s.started_at DESC LIMIT 50`).all<Record<string,unknown>>(),
    env.SPAWN_DB.prepare('SELECT * FROM search_reviews WHERE reviewed_at IS NULL ORDER BY triggered_at').all<Record<string,unknown>>(),
    emptyScanStreak(env)
  ]);
  return {month,budget,totals,recent:recent.results,reviews:reviews.results,streak};
}
