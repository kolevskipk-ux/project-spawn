import type { Env } from "./types";
import { benchmarkContext } from "./garfield";

export interface BoardRow {
  listing_key: string;
  title: string;
  watch_category: string;
  print_series?: string;
  retailer: string;
  retailer_sku: string | null;
  language: string;
  price_mxn: number | null;
  status: string;
  availability_state?: string;
  last_change_type: string;
  first_seen_at: string;
  last_seen_at: string;
  canonical_url: string;
  amazon_launch_mxn: number | null;
  amazon_confidence: string | null;
  collectr_usd: number | null;
  usd_mxn_rate: number | null;
  value_classification?: string;
}

const BOARD_QUERY = `WITH ranked AS (
  SELECT i.*, p.amazon_launch_mxn, p.amazon_confidence, p.collectr_usd, p.usd_mxn_rate,
    ROW_NUMBER() OVER (
      PARTITION BY replace(replace(lower(i.retailer), 'é', 'e'), 'í', 'i'), COALESCE(i.retailer_sku, i.canonical_url)
      ORDER BY i.last_seen_at DESC, i.first_seen_at DESC
    ) AS offer_rank
  FROM inventory i
  LEFT JOIN products p ON p.id = i.product_id
  WHERE i.canonical_url NOT LIKE '%/collections/%'
    AND i.canonical_url NOT LIKE '%/content/%'
    AND i.canonical_url NOT LIKE '%/undefined%'
)
SELECT listing_key, title, print_series, watch_category, retailer, retailer_sku, language, price_mxn, status, availability_state, last_change_type,
  first_seen_at, last_seen_at, canonical_url, amazon_launch_mxn, amazon_confidence, collectr_usd, usd_mxn_rate
FROM ranked WHERE offer_rank = 1
ORDER BY CASE status WHEN 'available' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END, last_seen_at DESC`;

export async function boardRows(env: Env): Promise<BoardRow[]> {
  return (await env.SPAWN_DB.prepare(BOARD_QUERY).all<BoardRow>()).results.map(row => ({...row, value_classification: benchmarkContext(row.price_mxn,row.amazon_launch_mxn,row.collectr_usd != null && row.usd_mxn_rate != null ? row.collectr_usd*row.usd_mxn_rate:null,row.availability_state).classification}));
}

export function percentDifference(price: number | null, reference: number | null): number | null {
  if (price == null || reference == null || reference <= 0) return null;
  return Math.round(((price - reference) / reference) * 100);
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]!);

const label = (value: string) => ({
  "30th_celebration": "30th Celebration", ascended_heroes: "Ascended Heroes",
  english: "English", spanish: "Spanish", bilingual: "Bilingual", japanese: "Japanese", chinese: "Chinese", unknown: "Unconfirmed",
  available: "Available", sold_out: "Sold out", baseline: "Baseline", new: "New", restock: "Restock", price_drop: "Price drop", unchanged: "Unchanged"
})[value] ?? value;

const money = (value: number | null) => value == null ? "Price unavailable" : `$${Math.round(value).toLocaleString("en-US")} MXN`;

function comparison(value: number | null, approximate = false): string {
  if (value == null) return `<span class="comparison unavailable">Unavailable</span>`;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const tone = value < -5 ? "good" : value > 25 ? "bad" : value > 5 ? "warn" : "neutral";
  return `<span class="comparison ${tone}">${approximate ? "≈ " : ""}${sign}${Math.abs(value)}%</span>`;
}

function freshness(lastSeen: string, now: Date): { text: string; stale: boolean } {
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(lastSeen)) / 3600000));
  if (hours < 1) return { text: "Verified less than 1 hour ago", stale: false };
  if (hours < 24) return { text: `Verified ${hours}h ago`, stale: false };
  const days = Math.floor(hours / 24);
  return { text: `Not rechecked for ${days}d`, stale: true };
}

function card(row: BoardRow, now: Date): string {
  const collectrMxn = row.collectr_usd != null && row.usd_mxn_rate != null ? row.collectr_usd * row.usd_mxn_rate : null;
  const amazonDifference = percentDifference(row.price_mxn, row.amazon_launch_mxn);
  const collectrDifference = percentDifference(row.price_mxn, collectrMxn);
  const valueClassification = row.value_classification ?? benchmarkContext(row.price_mxn, row.amazon_launch_mxn, collectrMxn, row.availability_state).classification;
  const fresh = freshness(row.last_seen_at, now);
  const searchable = [row.title, row.retailer, row.retailer_sku, row.print_series, label(row.language), valueClassification].join(" ").toLowerCase();
  return `<article class="offer" data-search="${escapeHtml(searchable)}" data-status="${escapeHtml(row.status)}" data-set="${escapeHtml(row.watch_category)}" data-language="${escapeHtml(row.language)}">
    <div class="offer-top"><span class="status ${escapeHtml(row.status)}">${escapeHtml(label(row.status))}</span>${row.last_change_type !== "unchanged" ? `<span class="change">${escapeHtml(label(row.last_change_type))}</span>` : ""}</div>
    <p class="set">${escapeHtml(row.print_series || label(row.watch_category))}</p>
    <h2>${escapeHtml(row.title)}</h2>
    <p class="retailer">${escapeHtml(row.retailer)}${row.retailer_sku ? ` <span>• SKU ${escapeHtml(row.retailer_sku)}</span>` : ""}</p>
    <div class="price">${escapeHtml(money(row.price_mxn))}</div>
    <dl class="comparisons">
      <div><dt>Value</dt><dd><span class="comparison neutral">${escapeHtml(valueClassification)}</span></dd></div>
      <div><dt>vs Amazon launch${row.amazon_confidence && row.amazon_confidence !== "exact" ? " proxy" : ""}</dt><dd>${comparison(amazonDifference)}</dd></div>
      <div><dt>vs Collectr</dt><dd>${comparison(collectrDifference, collectrDifference != null)}</dd></div>
    </dl>
    <div class="meta"><span>Language: <strong>${escapeHtml(label(row.language))}</strong></span><span class="${fresh.stale ? "stale" : ""}">${escapeHtml(fresh.text)}</span></div>
    <a class="buy" href="${escapeHtml(row.canonical_url)}" target="_blank" rel="noopener noreferrer">View product <span aria-hidden="true">↗</span></a>
  </article>`;
}

export function renderBoard(rows: BoardRow[], accessToken: string, now = new Date()): string {
  const available = rows.filter((row) => row.status === "available").length;
  const retailers = new Set(rows.map((row) => row.retailer.toLowerCase())).size;
  const lastVerified = rows.reduce((latest, row) => row.last_seen_at > latest ? row.last_seen_at : latest, "");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#11130f">
<title>Spawn Live Inventory</title><meta name="description" content="Current Pokémon TCG inventory monitored by Spawn.">
<style>
:root{color-scheme:dark;--bg:#11130f;--panel:#191c17;--line:#30352b;--text:#f4f5ee;--muted:#aab19f;--lime:#c9f65a;--green:#86d98b;--amber:#f1bd62;--red:#ff7770;--blue:#8bb9ff}*{box-sizing:border-box}
body{margin:0;background:radial-gradient(circle at 80% -10%,#30421b 0,transparent 28rem),var(--bg);color:var(--text);font:15px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}a{color:inherit}
.shell{width:min(1180px,calc(100% - 28px));margin:auto;padding:44px 0 72px}.eyebrow,.set{color:var(--lime);font-size:.73rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hero{display:grid;grid-template-columns:1.35fr .65fr;gap:34px;align-items:end;margin-bottom:30px}.hero h1{font-size:clamp(2.6rem,7vw,5.6rem);line-height:.92;letter-spacing:-.065em;margin:.25rem 0 1rem}.hero p{max-width:650px;color:var(--muted);font-size:1.05rem}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;border:1px solid var(--line);background:var(--line);border-radius:18px;overflow:hidden}.summary div{background:#171a15;padding:20px}.summary strong{display:block;font-size:1.7rem}.summary span{color:var(--muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.08em}
.controls{position:sticky;top:0;z-index:5;display:grid;grid-template-columns:2fr repeat(3,1fr) auto;gap:10px;margin:24px 0;padding:12px;background:rgba(17,19,15,.9);backdrop-filter:blur(14px);border:1px solid var(--line);border-radius:16px}.controls input,.controls select{width:100%;border:1px solid var(--line);background:#20241d;color:var(--text);padding:11px 12px;border-radius:10px;font:inherit}.download{display:grid;place-items:center;padding:0 16px;border-radius:10px;background:var(--lime);color:#15180f;text-decoration:none;font-weight:800}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.offer{display:flex;flex-direction:column;min-height:410px;padding:20px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#1d211a,#161914);box-shadow:0 16px 50px rgba(0,0,0,.16)}.offer[hidden]{display:none}.offer-top{display:flex;gap:8px;min-height:25px}.status,.change{align-self:flex-start;padding:4px 8px;border-radius:999px;font-size:.69rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.status.available{background:#183c22;color:#9be4a5}.status.sold_out{background:#3a201e;color:#ffa59e}.status.unknown{background:#35352a;color:#e3dba3}.change{background:#20334d;color:#9bc5ff}.set{margin:18px 0 5px}.offer h2{font-size:1.13rem;line-height:1.25;margin:0 0 8px}.retailer{color:var(--muted);margin:0}.retailer span{font-size:.76rem}.price{font-size:1.65rem;font-weight:850;letter-spacing:-.03em;margin:20px 0 12px}.comparisons{margin:0;border-block:1px solid var(--line);padding:8px 0}.comparisons div{display:flex;justify-content:space-between;align-items:center;padding:6px 0}.comparisons dt{color:var(--muted)}.comparisons dd{margin:0}.comparison{font-weight:800}.comparison.good{color:var(--green)}.comparison.bad{color:var(--red)}.comparison.warn{color:var(--amber)}.comparison.neutral{color:var(--text)}.comparison.unavailable{color:#747a6e;font-weight:600}.meta{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:.75rem;margin:14px 0}.stale{color:var(--amber)}.buy{margin-top:auto;display:flex;justify-content:space-between;padding:11px 13px;border:1px solid #4b5840;border-radius:10px;text-decoration:none;font-weight:750}.buy:hover,.buy:focus{border-color:var(--lime);color:var(--lime)}.empty{display:none;text-align:center;color:var(--muted);padding:60px 0}.note{color:var(--muted);font-size:.78rem;margin:24px 0 0}.note strong{color:var(--text)}
@media(max-width:900px){.hero{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,1fr)}.controls{grid-template-columns:1fr 1fr}.controls input{grid-column:1/-1}.download{min-height:44px}}
@media(max-width:620px){.shell{width:min(100% - 20px,1180px);padding-top:28px}.summary{grid-template-columns:1fr}.summary div{padding:13px 16px}.controls{position:static;grid-template-columns:1fr}.controls input{grid-column:auto}.grid{grid-template-columns:1fr}.offer{min-height:380px}.meta{flex-direction:column}.hero h1{font-size:3rem}}
</style></head><body><main class="shell">
<section class="hero"><div><div class="eyebrow">Project Spawn</div><h1>Live inventory,<br>without the noise.</h1><p>Current Pokémon TCG listings monitored across Mexico. Availability, language, price context, and freshness—kept in one place.</p></div>
<div class="summary"><div><strong>${available}</strong><span>Available</span></div><div><strong>${rows.length}</strong><span>Tracked offers</span></div><div><strong>${retailers}</strong><span>Retailers</span></div></div></section>
<section class="controls" aria-label="Inventory filters"><input id="search" type="search" placeholder="Search product, store or SKU…" aria-label="Search inventory">
<select id="status" aria-label="Filter by status"><option value="">All statuses</option><option value="available">Available</option><option value="sold_out">Sold out</option><option value="unknown">Unknown</option></select>
<select id="set" aria-label="Filter by set"><option value="">All sets</option><option value="30th_celebration">30th Celebration</option><option value="ascended_heroes">Ascended Heroes</option><option value="delta_reign">Delta Reign</option></select>
<select id="language" aria-label="Filter by language"><option value="">All languages</option><option value="english">English</option><option value="spanish">Spanish</option><option value="bilingual">Bilingual</option><option value="japanese">Japanese</option><option value="chinese">Chinese</option><option value="unknown">Unconfirmed</option></select>
<a class="download" href="/inventory.csv?access=${encodeURIComponent(accessToken)}">Excel / CSV</a></section>
<section id="grid" class="grid">${rows.map((row) => card(row, now)).join("")}</section><div id="empty" class="empty">No offers match these filters.</div>
<p class="note"><strong>How pricing works:</strong> negative percentages are below the reference; positive percentages are above it. Amazon represents a launch-price reference. Collectr represents an estimated secondary-market benchmark converted to MXN. References may be unavailable until an exact or comparable product is verified. Market values exclude shipping, taxes, fees, and liquidity.</p>
<p class="note">Last inventory verification: ${escapeHtml(lastVerified ? new Intl.DateTimeFormat("en-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" }).format(new Date(lastVerified)) : "Unavailable")}.</p>
</main><script>
const controls=[...document.querySelectorAll('input,select')],cards=[...document.querySelectorAll('.offer')],empty=document.getElementById('empty');
function filter(){const q=document.getElementById('search').value.trim().toLowerCase(),status=document.getElementById('status').value,set=document.getElementById('set').value,language=document.getElementById('language').value;let visible=0;for(const card of cards){const show=(!q||card.dataset.search.includes(q))&&(!status||card.dataset.status===status)&&(!set||card.dataset.set===set)&&(!language||card.dataset.language===language);card.hidden=!show;if(show)visible++}empty.style.display=visible?'none':'block'}controls.forEach(control=>control.addEventListener('input',filter));
</script></body></html>`;
}

export function boardHeaders(): HeadersInit {
  return { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };
}
