import type { Env } from "./types";

export class OperationalGuardError extends Error {
  constructor(public readonly code: "scan_in_progress" | "manual_cooldown", public readonly status: 409 | 429) {
    super(code);
  }
}

export async function auditSecurityEvent(env: Env, eventType: string, requestId: string | null, details: Record<string, unknown> = {}): Promise<void> {
  await env.SPAWN_DB.prepare("INSERT INTO security_events (event_type, occurred_at, request_id, details_json) VALUES (?, ?, ?, ?)")
    .bind(eventType, new Date().toISOString(), requestId, JSON.stringify(details).slice(0, 1000)).run();
}

export async function acquireScanLock(env: Env, owner: string, now: Date): Promise<boolean> {
  const acquiredAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const result = await env.SPAWN_DB.prepare(`INSERT INTO scan_locks (name, owner, acquired_at, expires_at)
    VALUES ('global_scan', ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at
    WHERE scan_locks.expires_at <= excluded.acquired_at`).bind(owner, acquiredAt, expiresAt).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function releaseScanLock(env: Env, owner: string): Promise<void> {
  await env.SPAWN_DB.prepare("DELETE FROM scan_locks WHERE name='global_scan' AND owner=?").bind(owner).run();
}

export async function acquireManualCooldown(env: Env, now: Date): Promise<boolean> {
  const current = now.toISOString();
  const nextAllowed = new Date(now.getTime() + 15 * 60_000).toISOString();
  const result = await env.SPAWN_DB.prepare(`INSERT INTO run_cooldowns (name, next_allowed_at, updated_at)
    VALUES ('manual_scan', ?, ?)
    ON CONFLICT(name) DO UPDATE SET next_allowed_at=excluded.next_allowed_at, updated_at=excluded.updated_at
    WHERE run_cooldowns.next_allowed_at <= ?`).bind(nextAllowed, current, current).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function allowedBy(binding: RateLimit | undefined, key: string): Promise<boolean> {
  if (!binding) return true;
  return (await binding.limit({ key })).success;
}

export function requestRateKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

export function feedbackClientNonce(request: Request): { nonce: string; isNew: boolean } {
  const cookies = request.headers.get("cookie") ?? "";
  const existing = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith("spawn_feedback_id="))?.slice("spawn_feedback_id=".length);
  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return { nonce: existing, isNew: false };
  return { nonce: crypto.randomUUID(), isNew: true };
}
