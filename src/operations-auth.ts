import {createRemoteJWKSet, jwtVerify} from 'jose';
import type {Env} from './types';

export type Operator = {email: string; subject: string; role: 'owner' | 'admin' | 'viewer'};
const identities = new WeakMap<Request, Operator>();
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export const operatorFor = (request: Request) => identities.get(request);
export const operatorActor = (request: Request) => operatorFor(request)?.email ?? 'operator:dashboard';
export const operationsPath = (path: string) => path === '/' || path === '/ops' || path.startsWith('/ops/') || path === '/dashboard' || path.startsWith('/dashboard/') || path === '/approvals' || path === '/inventory' || path === '/inventory.csv';

export async function authenticateOperator(request: Request, env: Env): Promise<Operator | null> {
  const issuer = env.OPS_ACCESS_ISSUER;
  if (!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !env.OPS_ACCESS_AUD || !env.OPS_OWNER_EMAIL) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return null;
  let keySet = keySets.get(issuer);
  if (!keySet) { keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {timeoutDuration: 5000}); keySets.set(issuer, keySet); }
  try {
    const {payload} = await jwtVerify(token, keySet, {issuer, audience: env.OPS_ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email'], maxTokenAge: '8h'});
    if (typeof payload.email !== 'string' || typeof payload.sub !== 'string' || !payload.sub) return null;
    const email = payload.email.trim().toLowerCase();
    let role: Operator['role'];
    if (email === env.OPS_OWNER_EMAIL.trim().toLowerCase()) role = 'owner';
    else {
      const member = await env.SPAWN_DB.prepare("SELECT role FROM ops_members WHERE email=? AND status='ACTIVE'").bind(email).first<{role: 'admin' | 'viewer'}>();
      if (!member || !['admin', 'viewer'].includes(member.role)) return null;
      role = member.role;
    }
    const operator: Operator = {email, subject: payload.sub, role};
    identities.set(request, operator);
    return operator;
  } catch { return null; }
}

export function boardAuthorized(request: Request, url: URL, env: Env): boolean {
  if (env.OPS_AUTH_MODE === 'access') return Boolean(operatorFor(request));
  return Boolean(env.BOARD_ACCESS_TOKEN) && url.searchParams.get('access') === env.BOARD_ACCESS_TOKEN;
}

export function mutationAllowed(request: Request, operator: Operator): boolean {
  if (['GET', 'HEAD'].includes(request.method)) return true;
  return operator.role !== 'viewer' && request.headers.get('origin') === new URL(request.url).origin && !['cross-site','none'].includes(request.headers.get('sec-fetch-site') ?? '') && ['application/x-www-form-urlencoded','multipart/form-data'].some(type => request.headers.get('content-type')?.startsWith(type));
}
