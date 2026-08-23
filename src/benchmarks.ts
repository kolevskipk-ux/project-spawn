import type { Env } from "./types";

const encoder = new TextEncoder();
const MAX_BODY_BYTES = 16_384;
const REPLAY_WINDOW_SECONDS = 300;

export interface BenchmarkCandidate {
  event_id: string;
  source: "catch_em_all";
  source_version: string;
  source_product_id: string;
  retailer: "Amazon México";
  product_name: string;
  asin: string;
  product_url: string;
  observed_state: "PREORDER_BUYABLE" | "BUYABLE";
  price_mxn: number;
  observed_at: string;
  sold_by_amazon: boolean | null;
  fulfilled_by_amazon: boolean | null;
}

const text = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max ? value : null;

export function parseBenchmarkCandidate(value: unknown): BenchmarkCandidate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const eventId = text(item.event_id, 128);
  const version = text(item.source_version, 80);
  const productId = text(item.source_product_id, 100);
  const productName = text(item.product_name, 240);
  const asin = text(item.asin, 10)?.toUpperCase() ?? null;
  const productUrl = text(item.product_url, 500);
  const observedAt = text(item.observed_at, 40);
  const observedState = item.observed_state;
  const price = item.price_mxn;
  if (!eventId || !version || !productId || !productName || !asin || !productUrl || !observedAt) return null;
  if (item.source !== "catch_em_all" || item.retailer !== "Amazon México") return null;
  if (!/^[A-Z0-9]{10}$/.test(asin) || !/^amazon-30th-[a-z0-9-]+$/.test(productId)) return null;
  if (observedState !== "PREORDER_BUYABLE" && observedState !== "BUYABLE") return null;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 1_000_000) return null;
  if (!Number.isFinite(Date.parse(observedAt))) return null;
  let url: URL;
  try { url = new URL(productUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "www.amazon.com.mx" || !url.pathname.toUpperCase().includes(asin)) return null;
  const nullableBoolean = (candidate: unknown) => candidate === null || typeof candidate === "boolean";
  if (!nullableBoolean(item.sold_by_amazon) || !nullableBoolean(item.fulfilled_by_amazon)) return null;
  return { event_id: eventId, source: "catch_em_all", source_version: version, source_product_id: productId,
    retailer: "Amazon México", product_name: productName, asin, product_url: url.toString(), observed_state: observedState,
    price_mxn: Math.round(price * 100) / 100, observed_at: new Date(observedAt).toISOString(),
    sold_by_amazon: item.sold_by_amazon as boolean | null, fulfilled_by_amazon: item.fulfilled_by_amazon as boolean | null };
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function verifyCatchSignature(secret: string | undefined, timestamp: string | null, signature: string | null, body: string, now = Date.now()): Promise<boolean> {
  if (!secret || secret.length < 32 || !timestamp || !signature || body.length > MAX_BODY_BYTES) return false;
  if (!/^\d{10}$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (age > REPLAY_WINDOW_SECONDS) return false;
  const expected = `sha256=${await hmacHex(secret, `${timestamp}.${body}`)}`;
  return constantTimeEqual(expected, signature);
}

export async function storeBenchmarkCandidate(env: Env, candidate: BenchmarkCandidate, receivedAt: string): Promise<boolean> {
  const result = await env.SPAWN_DB.prepare(`INSERT OR IGNORE INTO benchmark_candidates
    (event_id, source, source_version, source_product_id, retailer, product_name, asin, product_url, observed_state,
     price_mxn, observed_at, received_at, sold_by_amazon, fulfilled_by_amazon, review_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).bind(candidate.event_id, candidate.source,
      candidate.source_version, candidate.source_product_id, candidate.retailer, candidate.product_name, candidate.asin,
      candidate.product_url, candidate.observed_state, candidate.price_mxn, candidate.observed_at, receivedAt,
      candidate.sold_by_amazon == null ? null : Number(candidate.sold_by_amazon),
      candidate.fulfilled_by_amazon == null ? null : Number(candidate.fulfilled_by_amazon)).run();
  return (result.meta.changes ?? 0) > 0;
}
