import {SUPPORT_CONSENT_VERSION,supportConsent} from './support-consent';
import type {CustomerInventoryPage,CustomerListing} from './customer-feed';
import {saveSupport,supportKinds} from './customer-support';
import {createRemoteJWKSet, jwtVerify} from 'jose';
import {customerEntitlement,discordConfigured,finishDiscordLink,membershipRequired,startDiscordLink} from './customer-membership';
import {customerLegal,legalReady} from './customer-legal';
import {discordInteraction,syncInventoryRoles} from './customer-discord';

export interface CustomerEnv {
  CUSTOMER_MEMBERSHIP_MODE?: 'disabled'|'pilot'|'enforced'|'new_accounts';
  CUSTOMER_MEMBERSHIP_PILOT_EMAILS?: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_REQUIRED_ROLE_ID?: string;
  DISCORD_FREE_ACCESS_ENABLED?: string;
  DISCORD_INVENTORY_ROLE_ID?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_ROLE_SYNC_ENABLED?: string;
  CUSTOMER_PUBLIC_URL?: string;
  CUSTOMER_LEGAL_PUBLISHED?: string;
  CUSTOMER_TERMS_REQUIRED_FROM?: string;
  CUSTOMER_OPERATOR_NAME?: string;
  CUSTOMER_OPERATOR_ADDRESS?: string;
  CUSTOMER_PRIVACY_EMAIL?: string;
  CUSTOMER_TERMS_VERSION?: string;
  CUSTOMER_TERMS_EFFECTIVE_DATE?: string;
  CUSTOMER_DB: D1Database;
  CUSTOMER_SOURCE?: Fetcher;
  CUSTOMER_INVENTORY_MODE?: 'source' | 'samples';
  CUSTOMER_ACCESS_ISSUER: string;
  CUSTOMER_ACCESS_AUD: string;
  CUSTOMER_ENVIRONMENT: string;
  CUSTOMER_DATA_KIND?: 'sample' | 'published';
  CUSTOMER_SUPPORT_WEBHOOK_URL?: string;
}
type Member = {id: string; email: string; status: string; created_at?: string};
type Listing = CustomerListing;
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function customerReferences(row:Listing):string {
  if(!row.references?.length)return '<p class="muted">Price reference unavailable for this product.</p>';
  const money=(value:number)=>new Intl.NumberFormat('en-MX',{style:'currency',currency:'MXN'}).format(value);
  return `<section class="references" aria-label="Historical price references"><h3>Historical price references</h3>${row.references.map(r=>`<p><strong>${escape(r.source)} · ${escape(money(r.referenceMxn!))}</strong><br>${r.deltaPercent==null?'Offer comparison unavailable':`${r.deltaPercent>0?'+':''}${escape(r.deltaPercent)}% compared with this reference`}<br><span class="muted">Observed ${escape(r.capturedAt)}<br>${escape(r.note)}</span>${r.sourceUrl?`<br><a href="${escape(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Reference source</a>`:''}</p>`).join('')}<p class="muted">Historical context only; not a purchase recommendation.</p></section>`;
}
const headers = {
  'content-type':'text/html; charset=utf-8', 'cache-control':'private, no-store',
  // Browsers also apply form-action to the POST's redirect into Discord OAuth.
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://discord.com; frame-ancestors 'none'; base-uri 'none'",
  'referrer-policy':'same-origin', 'x-content-type-options':'nosniff', 'x-frame-options':'DENY',
  'x-robots-tag':'noindex, nofollow', 'permissions-policy':'camera=(), microphone=(), geolocation=()'
};
const style = `:root{color-scheme:dark;font-family:system-ui,sans-serif;color:#eef2f5;background:#0e1218}*{box-sizing:border-box}body{margin:0;font-size:16px;line-height:1.55}a{color:#c6f369}header{border-bottom:1px solid #303844}header>div,main,footer{max-width:1200px;margin:auto;padding:24px}header>div{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}.brand{font-weight:850;letter-spacing:.15em;text-decoration:none;color:#fff}.tag{color:#f4ce77;font-size:.875rem}.hero{max-width:760px;padding:8vh 0}h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.12;letter-spacing:-.04em;margin:16px 0}h2{font-size:1.15rem;margin:0 0 12px}.muted,footer{color:#aab6c5}.eyebrow{text-transform:uppercase;letter-spacing:.13em;color:#c6f369;font-size:.875rem}.button,button{display:inline-block;background:#c6f369;border:0;border-radius:8px;padding:12px 20px;color:#18200c;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.hero .button{margin:16px 0}.panel,article{border:1px solid #303844;background:#171d25;border-radius:12px;padding:24px}.filters{display:flex;align-items:end;flex-wrap:wrap;gap:16px;margin:24px 0}.filters label{display:flex;flex-direction:column;gap:6px;flex:1;min-width:150px}input,select{background:#0e1218;border:1px solid #526173;color:#eef2f5;padding:12px;border-radius:6px;font:inherit;min-width:0;width:100%}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:18px}article{position:relative;overflow:hidden;min-height:260px}article h2{padding-right:10px}.price{font-size:1.65rem;font-weight:750}.available{color:#c6f369}.sold_out{color:#f4ce77}.unknown{color:#aab6c5}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin-bottom:0}dt{color:#aab6c5}dd{margin:0}time{font-size:.875rem}.mark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}.mark span{transform:rotate(-24deg);font-size:18px;font-weight:750;letter-spacing:.06em;color:rgba(200,218,239,.14);white-space:nowrap}.identity{font-size:.875rem;overflow-wrap:anywhere}.pager{display:flex;gap:24px;margin:24px 0}.notice{border-left:3px solid #c6f369;padding:12px 18px;background:#171d25}.account{max-width:620px;margin:40px 0}.account button{margin-top:16px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #f4ce77;outline-offset:4px}@media(max-width:600px){header>div,main,footer{padding:18px}.hero{padding:28px 0}.filters button{width:100%}}@media print{header,.filters,.pager,footer{display:none}.mark span{color:#777!important}article{break-inside:avoid}.mark{display:flex!important}}`;
function contactHelp(env:CustomerEnv){
  const email=env.CUSTOMER_PRIVACY_EMAIL?.trim();
  if(!email||! /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email))return '';
  return '<p><a href="/app/support">Open a support ticket / Abrir un ticket</a>. For privacy/ARCO requests or if you cannot sign in / Para privacidad, derechos ARCO o si no puedes iniciar sesión: <a href="mailto:'+escape(email)+'">'+escape(email)+'</a>.</p>';
}
function page(env: CustomerEnv, title: string, body: string, member?: Member, status = 200, language: 'en'|'es' = 'en') {
  return new Response(`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Garfield</title><style>${style}</style></head><body><header><div><a class="brand" href="/">GARFIELD</a><span class="tag">${escape(env.CUSTOMER_ENVIRONMENT)}</span>${member ? '<a href="/app/account">My account</a>' : '<a href="/app">Sign in</a>'}</div></header><main>${body}</main><footer>Tracked listings, not the entire market. Availability and prices can change after observation. Observations older than 24 hours are shown as unconfirmed. <a href="/privacy">Account &amp; privacy information</a>${contactHelp(env)}</footer></body></html>`,{status,headers});
}
async function identity(request: Request, env: CustomerEnv): Promise<string | null> {
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.CUSTOMER_ACCESS_ISSUER ?? '') || !env.CUSTOMER_ACCESS_AUD) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return null;
  let keySet = keySets.get(env.CUSTOMER_ACCESS_ISSUER);
  if (!keySet) {keySet=createRemoteJWKSet(new URL(`${env.CUSTOMER_ACCESS_ISSUER}/cdn-cgi/access/certs`),{timeoutDuration:5000});keySets.set(env.CUSTOMER_ACCESS_ISSUER,keySet);}
  try {
    const {payload} = await jwtVerify(token,keySet,{issuer:env.CUSTOMER_ACCESS_ISSUER,audience:env.CUSTOMER_ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email'],maxTokenAge:'8h'});
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string') return null;
    const email=payload.email.trim().toLowerCase();
    return email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {return null;}
}
function sameOriginForm(request: Request) {
  return request.headers.get('origin')===new URL(request.url).origin && !['cross-site','none'].includes(request.headers.get('sec-fetch-site') ?? '') && request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded');
}
export function termsRequired(env:CustomerEnv,member:Member){
  if(!env.CUSTOMER_TERMS_REQUIRED_FROM)return false;
  const cutoff=Date.parse(env.CUSTOMER_TERMS_REQUIRED_FROM),created=Date.parse(member.created_at??'');
  return !Number.isFinite(cutoff)||!Number.isFinite(created)||created>=cutoff;
}
async function hasAcceptedTerms(env:CustomerEnv,member:Member){
  return Boolean(env.CUSTOMER_TERMS_VERSION&&await env.CUSTOMER_DB.prepare('SELECT 1 FROM customer_terms_acceptances WHERE customer_id=? AND terms_version=?').bind(member.id,env.CUSTOMER_TERMS_VERSION).first());
}
const redirect = (path: string) => new Response(null,{status:303,headers:{location:path,'cache-control':'no-store'}});
const watermark = (member: Member) => `GARFIELD · ${member.id.slice(0,12)} · ${new Date().toISOString().slice(0,10)}`;

export async function customerFetch(request: Request, env: CustomerEnv): Promise<Response> {
  const url=new URL(request.url), path=url.pathname;
  if(path==='/discord/interactions')return discordInteraction(request,env);
  if((path==='/terms'||path==='/privacy'&&legalReady(env))&&['GET','HEAD'].includes(request.method)){
    const language=url.searchParams.get('lang')==='en'?'en':'es';
    const title=path==='/terms'?(language==='es'?'Términos':'Terms'):(language==='es'?'Privacidad':'Privacy');
    return page(env,title,customerLegal(env,path==='/privacy',language),undefined,200,language);
  }
  if(path==='/privacy' && ['GET','HEAD'].includes(request.method))return page(env,'Account and privacy information',`<section class="account panel"><h1>Your account and data</h1><p>Garfield stores your verified email, customer ID, account status, registration date, and access-change records to run the dashboard and manage access. Cloudflare processes email-code authentication and hosts this service.</p><p>Your customer ID and the viewing date appear as watermarks. Watermarks identify the viewing account; they cannot prevent screenshots or copying.</p><p>Support requests are stored with your customer ID, request type, message, and delivery status. Messages and customer IDs are forwarded to our team's SUPPORT_SPAWN channel on Discord. Your email is available to authorized administrators in the support queue.</p><p>You can <a href="/app/support">request account removal or access help</a>. Removal requests require team review and do not immediately delete data. Do not include passwords or sign-in codes in messages.</p><a href="/">Back to Garfield</a></section>`);
  if(path==='/' && ['GET','HEAD'].includes(request.method)) return page(env,'Explore the inventory',`<section class="hero"><div class="eyebrow">Your inventory dashboard</div><h1>See the full tracked inventory.</h1><p class="muted">Create a free account to browse the listings we’re tracking, check observed availability, and filter by set or store.</p><a class="button" href="/app">Get dashboard access</a><p>Sign in with a code sent to your email. Before signing in, review our <a href="/privacy?lang=en">privacy notice</a> / <a href="/privacy?lang=es">aviso de privacidad</a>. Cloudflare handles email authentication; we store your verified email and account records to provide access.</p><p><a href="/terms?lang=es">Términos</a> · <a href="/terms?lang=en">Terms</a>. New accounts accept the terms and confirm they are 18 or older during onboarding. Existing members retain access without acknowledging this update.</p><p class="muted">Browser access only. Downloads are unavailable during the pilot.</p>${env.CUSTOMER_DATA_KIND==='published'?'':'<p class="notice">This staging pilot uses sample listings, not live offers.</p>'}</section>`);
  if(!['/app','/app/account','/app/join','/app/support','/app/onboarding','/app/discord/start','/app/discord/callback','/app/terms','/app/legal/terms','/app/legal/privacy'].includes(path)) return page(env,'Page not found','<h1>Page not found</h1><a href="/app">Return to inventory</a>',undefined,404);
  if(!['GET','HEAD'].includes(request.method) && !(['/app/join','/app/support','/app/discord/start','/app/terms'].includes(path) && request.method==='POST')) return page(env,'Action unavailable','<h1>Action unavailable</h1>',undefined,405);
  const email=await identity(request,env);
  if(!email) return page(env,'Sign-in required','<h1>Sign-in required</h1><p>Your session could not be verified. Please sign in again.</p><a href="/cdn-cgi/access/logout">Sign out and retry</a>',undefined,401);
  const window=Math.floor(Date.now()/60000);
  const rate=await env.CUSTOMER_DB.prepare(`INSERT INTO customer_rate_limits(subject,window,requests) VALUES(?,?,1) ON CONFLICT(subject) DO UPDATE SET requests=CASE WHEN window=excluded.window THEN requests+1 ELSE 1 END,window=excluded.window RETURNING requests`).bind(email,window).first<{requests:number}>();
  if(!rate || rate.requests>120) return new Response('Please wait a minute before trying again.',{status:429,headers:{...headers,'retry-after':'60'}});
  let member=await env.CUSTOMER_DB.prepare('SELECT id,email,status,created_at FROM customer_members WHERE email=?').bind(email).first<Member>();
  if(member?.status==='REVOKED' && path!=='/app/support') return page(env,'Access unavailable','<h1>Access unavailable</h1><p>Your dashboard access has been disabled.</p><a href="/app/support">Contact support</a>',undefined,403);
  if(path==='/app/join' && request.method==='POST') {
    if(!sameOriginForm(request)) return page(env,'Request not accepted','<h1>Request not accepted</h1><p>Open the registration form on this website and try again.</p>',undefined,403);
    await env.CUSTOMER_DB.prepare("INSERT INTO customer_members(id,email,status,created_at) VALUES(?,?,'ACTIVE',?) ON CONFLICT(email) DO NOTHING").bind(crypto.randomUUID(),email,new Date().toISOString()).run();
    return redirect('/app');
  }
  if(!member) return page(env,'Create your account',`<section class="account panel"><div class="eyebrow">One more step</div><h1>Create your account</h1><p>Email verified: <strong>${escape(email)}</strong></p><p>Your account gives you read-only access to the tracked inventory. We store your verified email, account ID, and registration date to manage access. Your account ID appears as a watermark on listings.</p><p class="muted">Downloads are unavailable in this pilot.</p><form method="post" action="/app/join"><button>Create account &amp; view inventory</button></form></section>`);
  if(path==='/app/discord/start'&&request.method==='POST'){
    if(!sameOriginForm(request))return new Response('Open the linking form on this website.',{status:403,headers});
    return redirect(await startDiscordLink(env,member));
  }
  if(path==='/app/discord/callback'){
    try{await finishDiscordLink(env,member,url);return redirect('/app/onboarding');}
    catch(error){const diagnostic=error instanceof Error&&/^discord_(token_(invalid_client|invalid_grant|invalid_request|http_[0-9]{3})|identity_http_[0-9]{3}|stage_(configuration|state|token_request|token_response|identity_request|identity_response|save_link))$/.test(error.message)?error.message:'link_incomplete';return page(env,'Link not completed','<h1>Discord link not completed</h1><p>The link expired, authorization failed, or this Discord account is already linked. Try again or contact support to change your linked account.</p><p>Diagnostic: '+escape(diagnostic)+'</p><a href="/app/onboarding">Return to onboarding</a>',member,400);}
  }
  if(path==='/app/legal/terms'||path==='/app/legal/privacy'){
    if(!legalReady(env))return redirect('/app/onboarding');
    const document=path.endsWith('/terms')?'terms':'privacy';
    if(request.method==='GET')await env.CUSTOMER_DB.prepare('INSERT INTO customer_legal_document_views(customer_id,terms_version,document,opened_at) VALUES(?,?,?,?) ON CONFLICT(customer_id,terms_version,document) DO UPDATE SET opened_at=excluded.opened_at').bind(member.id,env.CUSTOMER_TERMS_VERSION!,document,new Date().toISOString()).run();
    return redirect('/'+document+'?lang='+(url.searchParams.get('lang')==='en'?'en':'es'));
  }
  if(path==='/app/terms'&&request.method==='POST'){
    if(!sameOriginForm(request))return new Response('Open the terms form on this website.',{status:403,headers});
    const form=await request.formData();
    if(!legalReady(env)||form.get('version')!==env.CUSTOMER_TERMS_VERSION||form.get('terms')!=='yes'||form.get('adult')!=='yes')return page(env,'Review terms','<h1>Review the current terms and confirm you are at least 18.</h1><a href="/app/onboarding">Return</a>',member,400);
    const opened=await env.CUSTOMER_DB.prepare('SELECT COUNT(*) AS n FROM customer_legal_document_views WHERE customer_id=? AND terms_version=?').bind(member.id,env.CUSTOMER_TERMS_VERSION!).first<{n:number}>();
    if(opened?.n!==2)return page(env,'Open both documents','<h1>Open the terms and privacy notice first</h1><p>Return to setup and open both documents in your preferred language before saving acceptance.</p><a href="/app/onboarding">Return to setup</a>',member,400);
    await env.CUSTOMER_DB.prepare("INSERT OR IGNORE INTO customer_terms_acceptances(customer_id,terms_version,accepted_at,adult_confirmed) SELECT ?,?,?,1 WHERE EXISTS(SELECT 1 FROM customer_members WHERE id=? AND status='ACTIVE')").bind(member.id,env.CUSTOMER_TERMS_VERSION!,new Date().toISOString(),member.id).run();
    return redirect('/app/onboarding');
  }
  if(path==='/app/onboarding'){
    const requiresMembership=membershipRequired(env,member);
    const accepted=await hasAcceptedTerms(env,member);
    const entitlement=requiresMembership?await customerEntitlement(env,member):{allowed:!termsRequired(env,member)||accepted,reason:termsRequired(env,member)&&!accepted?'accept_terms':'review_optional'};
    const viewed=legalReady(env)&&!accepted?(await env.CUSTOMER_DB.prepare('SELECT document FROM customer_legal_document_views WHERE customer_id=? AND terms_version=?').bind(member.id,env.CUSTOMER_TERMS_VERSION!).all<{document:string}>()).results:[];
    const documentStatus=(document:string)=>viewed.some(v=>v.document===document)?'Opened':'Not opened';
    const messages:Record<string,string>={review_optional:'You can review the terms here. Existing members keep their access if they do not acknowledge this notice.',link_discord:'Link your Discord account to verify your Poke Primos server membership.',configuration:'Discord onboarding is being configured.',join_server:'Join the Poke Primos server and complete its membership screening.',retry_discord:'Discord could not be reached. Please retry shortly.',required_role:'Your Discord account does not have the required membership role.',accept_terms:'Review the terms and confirm that you are at least 18.',member:'Your membership and terms acceptance are verified.',temporary_grace:'Your recent membership verification remains valid during a temporary Discord interruption.'};
    return page(env,'Inventory access',`<style>.consent-row{display:flex;align-items:flex-start;gap:12px;margin:18px 0;cursor:pointer}.consent-row input[type=checkbox]{width:20px;height:20px;flex:0 0 20px;margin:3px 0 0;padding:0;accent-color:#c6f369}.consent-row span{display:block}.setup-step{border-top:1px solid #303844;padding-top:24px;margin-top:24px}.account h1{font-size:2.3rem}</style><section class="account panel"><div class="eyebrow">Poke Primos</div><h1>Set up inventory access</h1><p>${escape(messages[entitlement.reason]??'Contact support for access help.')}</p><h2 class="setup-step">1. Connect Discord</h2>${discordConfigured(env)?'<form method="post" action="/app/discord/start"><button>Link Discord account</button></form>':'<p>Discord linking will be available soon.</p>'}<h2 class="setup-step">2. Review the terms</h2>${accepted?'<p class="available">Your acceptance has been saved.</p>':legalReady(env)?`<form method="post" action="/app/terms"><input type="hidden" name="version" value="${escape(env.CUSTOMER_TERMS_VERSION)}"><p class="muted">Open both documents below in your preferred language before saving acceptance. After returning, save acceptance to continue.</p><p class="muted">Terms: ${documentStatus('terms')} · Privacy: ${documentStatus('privacy')} (refresh this page to update)</p><p><a href="/app/legal/terms?lang=es" target="_blank" lang="es">Términos</a> · <a href="/app/legal/privacy?lang=es" target="_blank" lang="es">Privacidad</a> · <a href="/app/legal/terms?lang=en" target="_blank" lang="en">Terms</a> · <a href="/app/legal/privacy?lang=en" target="_blank" lang="en">Privacy</a></p><label class="consent-row"><input type="checkbox" name="terms" value="yes" required><span>I accept the current terms.<br><span class="muted" lang="es">Acepto los términos vigentes.</span></span></label><label class="consent-row"><input type="checkbox" name="adult" value="yes" required><span>I am at least 18 years old.<br><span class="muted" lang="es">Tengo al menos 18 años.</span></span></label><button>Save acceptance</button></form>`:'<p>Terms are being prepared; acceptance is not open yet.</p>'}${entitlement.allowed?'<p><a class="button" href="/app">Open inventory</a></p>':''}<p><a href="/app/support">Access help</a> · <a href="/app/account">My account</a></p></section>`,member);
  }
  if(path==='/app/account') return page(env,'My account',`<section class="account panel"><h1>My account</h1><p>${escape(member.email)}</p><p class="identity">Customer ID: ${escape(member.id)}</p><p>Access: customer · read only</p><p>Downloads: unavailable</p><p class="muted"><a href="/app/onboarding">Manage Discord membership and terms</a>. For access help or account removal, <a href="/app/support">contact support</a>.</p><p><a href="/app">Back to inventory</a></p><a href="/cdn-cgi/access/logout">Sign out</a></section>`,member);
  if(path==='/app/join') return redirect('/app');
  if(path==='/app/support') {
    if(request.method==='POST') {
      if(!sameOriginForm(request))return page(env,'Request not accepted','<h1>Open the support form on this website and try again.</h1>',member,403);
      if(Number(request.headers.get('content-length')??0)>8192)return new Response('Request too large',{status:413,headers});
      const raw=await request.text();
      if(raw.length>8192)return new Response('Request too large',{status:413,headers});
      const form=new URLSearchParams(raw),kind=form.get('kind')??'',message=(form.get('message')??'').trim();
      if(!Object.hasOwn(supportKinds,kind)||!message||message.length>1000)return page(env,'Check your request','<h1>Check your request</h1><p>Choose a request type and enter a message of up to 1,000 characters.</p><a href="/app/support">Return to support</a>',member,400);
      if(form.get('support_consent')!=='yes'||form.get('support_consent_version')!==SUPPORT_CONSENT_VERSION)return page(env,'Choose a support channel','<h1>Choose a support channel</h1><p>Discord delivery needs your separate consent. You can use the email contact below without changing inventory eligibility.</p><a href="/app/support">Return to support</a>',member,400);
      const id=await saveSupport(env,member.id,kind,message,{version:SUPPORT_CONSENT_VERSION,accepted:true});
      if(!id)return page(env,'Please try later','<h1>Please try later</h1><p>You can send up to five requests per hour.</p>',member,429);
      return redirect(`/app/support?request=${id}`);
    }
    const requested=url.searchParams.get('request')??'';
    const saved=/^[a-f0-9-]{36}$/.test(requested)?await env.CUSTOMER_DB.prepare('SELECT id FROM customer_support WHERE id=? AND customer_id=?').bind(requested,member.id).first<{id:string}>():null;
    return page(env,'Support',`<section class="account panel"><h1>Contact support</h1>${saved?`<p class="notice" role="status">Request saved. Reference: ${escape(saved.id)}. Our team will review it.</p>`:''}<p>Send an account-access question or request account removal. Your message, request and customer IDs, category and timestamp will be shared with our team in a private Discord support channel. Please do not include identity documents, passwords, sign-in codes, or payment details. For privacy/ARCO requests, use the email contact below.</p><form method="post" action="/app/support"><label>Request type<select name="kind">${Object.entries(supportKinds).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>Message<textarea name="message" required maxlength="1000" rows="6" style="width:100%;font:inherit"></textarea></label><input type="hidden" name="support_consent_version" value="${SUPPORT_CONSENT_VERSION}"><label><input type="checkbox" name="support_consent" value="yes" required> ${escape(supportConsent.en)}<br><span lang="es">${escape(supportConsent.es)}</span></label><p><a href="mailto:${escape(env.CUSTOMER_PRIVACY_EMAIL??'sales@aztlan-eng.com')}">Use email instead / Usar correo electrónico</a></p><button>Send request</button></form><p>Requests are stored even if Discord delivery is temporarily unavailable. Submitting an account-removal request does not immediately delete the account.</p><a href="/app">Back to inventory</a></section>`,member);
  }
  if(termsRequired(env,member)&&!await hasAcceptedTerms(env,member))return redirect('/app/onboarding');
  if(membershipRequired(env,member)){const entitlement=await customerEntitlement(env,member);if(!entitlement.allowed)return redirect('/app/onboarding');}
  const q=(url.searchParams.get('q')??'').trim().slice(0,100), set=(url.searchParams.get('set')??'').slice(0,100), store=(url.searchParams.get('store')??'').slice(0,100);
  const availability=['available','sold_out','unknown'].includes(url.searchParams.get('availability')??'') ? url.searchParams.get('availability')! : '';
  const pageNumber=Math.min(1000,Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)));
  const where="publication_state='PUBLISHED' AND (?='' OR instr(lower(title),lower(?))>0) AND (?='' OR set_name=?) AND (?='' OR retailer=?) AND (?='' OR availability=?)";
  const params=[q,q,set,set,store,store,availability,availability];
  let result: {results: Listing[]}, facets: {results: {set_name:string;retailer:string}[]};
  if(env.CUSTOMER_INVENTORY_MODE==='source') {
    if(!env.CUSTOMER_SOURCE) throw new Error('Customer source unavailable');
    const feedUrl=new URL('https://customer-source/inventory');feedUrl.search=url.search;
    const feed=await env.CUSTOMER_SOURCE.fetch(feedUrl.toString(),{signal:AbortSignal.timeout(5000)});
    if(!feed.ok) throw new Error('Customer source unavailable');
    const inventory=await feed.json() as CustomerInventoryPage;
    if(!Array.isArray(inventory.rows)||inventory.rows.length>25||!Array.isArray(inventory.facets)||inventory.facets.length>1000)throw new Error('Invalid inventory page');
    result={results:inventory.rows};facets={results:inventory.facets};
  } else {
  [result, facets]=await Promise.all([
    env.CUSTOMER_DB.prepare(`SELECT id,title,set_name,retailer,language,price_mxn,availability,observed_at FROM customer_listings WHERE ${where} ORDER BY title,id LIMIT 25 OFFSET ?`).bind(...params,(pageNumber-1)*24).all<Listing>(),
    env.CUSTOMER_DB.prepare("SELECT DISTINCT set_name,retailer FROM customer_listings WHERE publication_state='PUBLISHED' LIMIT 1000").all<{set_name:string;retailer:string}>()
  ]);
  }
  const options=(values:string[],selected:string)=>[...new Set(values)].sort().map(value=>`<option value="${escape(value)}" ${value===selected?'selected':''}>${escape(value)}</option>`).join('');
  const labels:Record<string,string>={available:'Observed available',sold_out:'Observed sold out',unknown:'Availability unconfirmed'};
  const cards=result.results.slice(0,24).map(row=>`<article><div class="eyebrow">${escape(row.set_name)}</div><h2>${escape(row.title)}</h2><p class="price">${row.price_mxn==null?'Price unconfirmed':escape(new Intl.NumberFormat('en-MX',{style:'currency',currency:'MXN'}).format(row.price_mxn))}</p><p class="${escape(row.availability)}">${escape(labels[row.availability]??'Availability unconfirmed')}</p><dl><dt>Store</dt><dd>${escape(row.retailer)}</dd><dt>Language</dt><dd>${escape(row.language)}</dd><dt>Observed</dt><dd><time>${escape(row.observed_at.replace('T',' ').replace('Z',' UTC'))}</time></dd></dl>${row.delivery_note?`<p class="muted">${escape(row.delivery_note)}</p>`:""}${customerReferences(row)}<div class="mark" aria-hidden="true"><span>${escape(watermark(member!))}</span></div></article>`).join('');
  const pageLink=(number:number,label:string)=>{const next=new URLSearchParams({q,set,store,availability,page:String(number)});return `<a href="/app?${escape(next.toString())}">${label}</a>`;};
  return page(env,'Inventory',`<div class="eyebrow">Explore the listings</div><h1>Tracked inventory</h1><p class="muted">Filter the inventory by set, store, or observed availability.</p>${env.CUSTOMER_DATA_KIND==='published'?'':'<p class="notice">Sample listings for testing · No live purchasing information</p>'}<form class="filters" method="get" action="/app"><label>Search<input name="q" value="${escape(q)}" maxlength="100" placeholder="Product name"></label><label>Set<select name="set"><option value="">All sets</option>${options(facets.results.map(r=>r.set_name),set)}</select></label><label>Store<select name="store"><option value="">All stores</option>${options(facets.results.map(r=>r.retailer),store)}</select></label><label>Availability<select name="availability"><option value="">Any availability</option>${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${availability===key?'selected':''}>${label}</option>`).join('')}</select></label><button>Apply filters</button><a href="/app">Clear</a></form><div class="grid">${cards||'<p>No listings match these filters. <a href="/app">Clear filters</a></p>'}</div><nav class="pager" aria-label="Inventory pages">${pageNumber>1?pageLink(pageNumber-1,'Previous'):''}<span>Page ${pageNumber}</span>${result.results.length>24?pageLink(pageNumber+1,'Next'):''}</nav><p class="identity muted">Viewing as customer ${escape(member.id)} · Downloads unavailable</p>`,member);
}

export default {scheduled(_controller:ScheduledController,env:CustomerEnv,ctx:ExecutionContext){ctx.waitUntil(syncInventoryRoles(env).catch(()=>console.error('Discord role synchronization failed')));},async fetch(request: Request, env: CustomerEnv): Promise<Response> {
  try {const response=await customerFetch(request,env);return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;}
  catch {return page(env,'Temporarily unavailable','<h1>Temporarily unavailable</h1><p>Please try again shortly.</p>',undefined,503);}
}};
